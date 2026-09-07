var hideLabel = function(label) {
    label.labelObject.style.opacity = 0;
    label.labelObject.style.transition = 'opacity 0s';
};
var showLabel = function(label) {
    label.labelObject.style.opacity = 1;
    label.labelObject.style.transition = 'opacity 1s';
};
labelEngine = new labelgun.default(hideLabel, showLabel);

var id = 0;
var labels = [];
var totalMarkers = 0;

function resetLabels(markers) {
    labelEngine.reset();
    var i = 0;
    for (var j = 0; j < markers.length; j++) markers[j].eachLayer(function(label){ addLabel(label, ++i); });
    labelEngine.update();
}

function addLabel(layer, id) {
    if (layer.getTooltip()) {
        var label = layer.getTooltip()._source._tooltip._container;
        if (label) {
            var rect = label.getBoundingClientRect();
            var bottomLeft = map.containerPointToLatLng([rect.left, rect.bottom]);
            var topRight = map.containerPointToLatLng([rect.right, rect.top]);
            var boundingBox = { bottomLeft:[bottomLeft.lng,bottomLeft.lat], topRight:[topRight.lng,topRight.lat] };
            labelEngine.ingestLabel(boundingBox,id,parseInt(Math.random()*(5-1)+1),label,"Test "+id,false);
            if (!layer.added) { layer.addTo(map); layer.added = true; }
        }
    }
}

// Pas de surbrillance ni popup au survol : informations uniquement au clic.
(function () {
    function disableHoverInteraction() {
        if (typeof layer_AUACAD_4 === 'undefined' || !layer_AUACAD_4.eachLayer) {
            setTimeout(disableHoverInteraction,250);
            return;
        }
        layer_AUACAD_4.eachLayer(function(parcelLayer){
            parcelLayer.off('mouseover');
            parcelLayer.off('mouseout');
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded',function(){ setTimeout(disableHoverInteraction,250); });
    } else setTimeout(disableHoverInteraction,250);
})();

// ============================================================
// AUACAD - EXPORT PDF NORMALISE
// - vue d'impression indépendante de la vue écran ;
// - échelle fixe selon la surface : 1:500 / 1:1000 / 1:2000 ;
// - parcelle sélectionnée placée au centre exact du cadre ;
// - cadre 180 x 160 mm ;
// - aucune déformation : la carte temporaire a exactement le même ratio ;
// - nord et cadre en gris ;
// - pas d'échelle graphique.
// ============================================================
(function () {
    function wait(ms){ return new Promise(function(resolve){ setTimeout(resolve,ms); }); }
    function safeValue(value){ return value === null || value === undefined || value === '' ? '-' : String(value); }

    function collectRings(latlngs, out) {
        out = out || [];
        if (!Array.isArray(latlngs) || !latlngs.length) return out;
        if (latlngs[0] && typeof latlngs[0].lat === 'number') {
            out.push(latlngs);
            return out;
        }
        latlngs.forEach(function(item){ collectRings(item,out); });
        return out;
    }

    function getClickedPartBounds(layer, clickLatLng) {
        if (!layer || !layer.getLatLngs) return layer.getBounds();
        var rings = collectRings(layer.getLatLngs(),[]);
        if (!rings.length) return layer.getBounds();

        var chosen = null;
        var bestDistance = Infinity;

        rings.forEach(function(ring){
            if (!ring || ring.length < 3) return;
            var b = L.latLngBounds(ring);
            if (clickLatLng && b.contains(clickLatLng)) {
                var d = map.distance(b.getCenter(),clickLatLng);
                if (d < bestDistance) {
                    bestDistance = d;
                    chosen = b;
                }
            }
        });

        if (!chosen && clickLatLng) {
            rings.forEach(function(ring){
                if (!ring || ring.length < 3) return;
                var b = L.latLngBounds(ring);
                var d = map.distance(b.getCenter(),clickLatLng);
                if (d < bestDistance) {
                    bestDistance = d;
                    chosen = b;
                }
            });
        }
        return chosen || layer.getBounds();
    }

    function choosePrintScale(properties, partBounds) {
        var area = Number(properties['Aire m²']);
        var scale = 500;
        if (isFinite(area)) {
            if (area > 2000) scale = 2000;
            else if (area > 500) scale = 1000;
        }

        var center = partBounds.getCenter();
        var west = L.latLng(center.lat,partBounds.getWest());
        var east = L.latLng(center.lat,partBounds.getEast());
        var south = L.latLng(partBounds.getSouth(),center.lng);
        var north = L.latLng(partBounds.getNorth(),center.lng);
        var parcelW = map.distance(west,east);
        var parcelH = map.distance(south,north);

        var scales = [500,1000,2000,5000];
        for (var i=0;i<scales.length;i++) {
            if (scales[i] < scale) continue;
            var groundW = 0.180 * scales[i];
            var groundH = 0.160 * scales[i];
            if (parcelW <= groundW*0.70 && parcelH <= groundH*0.70) return scales[i];
        }
        return 5000;
    }

    function zoomForScale(latitude, scaleDenominator, cssWidthPx, frameWidthMm) {
        var groundWidthMeters = (frameWidthMm/1000) * scaleDenominator;
        var desiredMetersPerPixel = groundWidthMeters / cssWidthPx;
        var initialResolution = 156543.03392804097 * Math.cos(latitude*Math.PI/180);
        return Math.log(initialResolution/desiredMetersPerPixel)/Math.LN2;
    }

    async function exportFicheParcellaire(layer) {
        if (!layer || !layer.feature || !layer.getBounds) {
            alert("Impossible d'identifier la parcelle sélectionnée.");
            return;
        }

        var p = layer.feature.properties || {};
        var popup = layer.getPopup ? layer.getPopup() : null;
        var popupWasOpen = !!(popup && popup.isOpen && popup.isOpen());
        var clickLatLng = (map._popup && map._popup.getLatLng) ? map._popup.getLatLng() : null;
        var mapElement = document.getElementById('map');
        var hiddenControls = [];

        var oldCenter = map.getCenter();
        var oldZoom = map.getZoom();
        var oldZoomSnap = map.options.zoomSnap;
        var oldZoomDelta = map.options.zoomDelta;
        var oldStyle = {
            width:mapElement.style.width,
            height:mapElement.style.height,
            margin:mapElement.style.margin,
            position:mapElement.style.position,
            left:mapElement.style.left,
            top:mapElement.style.top,
            zIndex:mapElement.style.zIndex
        };

        try {
            var selectedBounds = getClickedPartBounds(layer,clickLatLng);
            var selectedCenter = selectedBounds.getCenter();
            var printScale = choosePrintScale(p,selectedBounds);

            map.closePopup();

            var printWpx = 900;
            var printHpx = 800;
            mapElement.style.width = printWpx+'px';
            mapElement.style.height = printHpx+'px';
            mapElement.style.margin = '0';
            mapElement.style.position = 'fixed';
            mapElement.style.left = '-12000px';
            mapElement.style.top = '0';
            mapElement.style.zIndex = '-1';

            map.invalidateSize(false);

            map.options.zoomSnap = 0;
            map.options.zoomDelta = 0.25;
            var printZoom = zoomForScale(selectedCenter.lat,printScale,printWpx,180);

            map.setView(selectedCenter,printZoom,{animate:false});
            map.invalidateSize(false);
            await wait(1000);

            layer.setStyle({ color:'#e00000', weight:6, opacity:1, fillOpacity:0 });
            if (layer.bringToFront) layer.bringToFront();

            ['.leaflet-control-container','.leaflet-popup','#map-title','#map-info-btn','#map-info-box','#coord-toggle-btn','#coord-search-box'].forEach(function(selector){
                document.querySelectorAll(selector).forEach(function(el){
                    hiddenControls.push({el:el,display:el.style.display});
                    el.style.display='none';
                });
            });
            await wait(250);

            var canvas = await html2canvas(mapElement,{
                useCORS:true,
                allowTaint:false,
                scale:2,
                width:printWpx,
                height:printHpx,
                backgroundColor:'#ffffff',
                logging:false
            });
            var imgData = canvas.toDataURL('image/png');

            var doc = new window.jspdf.jsPDF('portrait','mm','a4');

            doc.setTextColor(25,25,25);
            doc.setFont('helvetica','bold');
            doc.setFontSize(17);
            doc.text('FICHE PARCELLAIRE - AUACAD',15,16);
            doc.setDrawColor(45,105,155);
            doc.setLineWidth(0.5);
            doc.line(15,21,195,21);

            doc.setFontSize(10.5);
            var y=30;
            [['Lot',p.lot],['Nature',p.nature],['Cercle',p.cercle],['Localité',p.localite],['Surface (m²)',p['Aire m²']],['TF Global',p['TF Global']],['Échelle','1:'+printScale]].forEach(function(row){
                doc.setFont('helvetica','bold'); doc.text(row[0]+' :',15,y);
                doc.setFont('helvetica','normal'); doc.text(safeValue(row[1]),48,y);
                y+=7;
            });

            var planX=15;
            var planY=82;
            var frameW=180;
            var frameH=160;
            doc.addImage(imgData,'PNG',planX,planY,frameW,frameH);
            doc.setDrawColor(135,135,135);
            doc.setLineWidth(0.45);
            doc.rect(planX,planY,frameW,frameH);

            var nx=planX+frameW-8;
            var ny=planY+10;
            doc.setTextColor(120,120,120);
            doc.setFont('helvetica','bold');
            doc.setFontSize(8);
            doc.text('N',nx,ny-4,{align:'center'});
            doc.setFillColor(120,120,120);
            doc.triangle(nx,ny-2,nx-2.6,ny+6,nx+2.6,ny+6,'F');

            // Légende : uniquement le numéro du lot.
            var lx=planX+6;
            var ly=planY+frameH-9;
            doc.setFillColor(255,255,255);
            doc.setDrawColor(190,190,190);
            doc.rect(lx-2.5,ly-4.5,23,8.5,'FD');
            doc.setDrawColor(224,0,0);
            doc.setLineWidth(0.8);
            doc.rect(lx,ly-2.1,6,4.2);
            doc.setTextColor(90,90,90);
            doc.setFont('helvetica','normal');
            doc.setFontSize(8);
            doc.text(safeValue(p.lot),lx+8.5,ly+0.9);

            doc.setDrawColor(45,105,155);
            doc.setLineWidth(0.35);
            doc.line(15,274,195,274);
            doc.setTextColor(80,80,80);
            doc.setFontSize(7.5);
            doc.text('Document généré depuis la webmap AUACAD - usage indicatif',15,281);

            doc.save('Fiche_Parcelle_'+safeValue(p.lot).replace(/[^a-zA-Z0-9_-]/g,'_')+'.pdf');
        } catch(error) {
            console.error('Erreur export PDF AUACAD :',error);
            alert("Une erreur est survenue pendant la génération de la fiche PDF.");
        } finally {
            hiddenControls.forEach(function(item){ item.el.style.display=item.display; });

            if (typeof layer_AUACAD_4 !== 'undefined' && layer_AUACAD_4.resetStyle) layer_AUACAD_4.resetStyle(layer);

            map.options.zoomSnap = oldZoomSnap;
            map.options.zoomDelta = oldZoomDelta;
            mapElement.style.width = oldStyle.width;
            mapElement.style.height = oldStyle.height;
            mapElement.style.margin = oldStyle.margin;
            mapElement.style.position = oldStyle.position;
            mapElement.style.left = oldStyle.left;
            mapElement.style.top = oldStyle.top;
            mapElement.style.zIndex = oldStyle.zIndex;
            map.invalidateSize(false);
            map.setView(oldCenter,oldZoom,{animate:false});
            map.invalidateSize(false);

            if (popupWasOpen && layer.openPopup) setTimeout(function(){ layer.openPopup(); },180);
        }
    }

    document.addEventListener('click',function(event){
        var button=event.target.closest ? event.target.closest('.pdf-btn') : null;
        if(!button)return;
        event.preventDefault();
        event.stopPropagation();
        if(event.stopImmediatePropagation)event.stopImmediatePropagation();
        var sourceLayer=map && map._popup ? map._popup._source : null;
        exportFicheParcellaire(sourceLayer);
    },true);
})();