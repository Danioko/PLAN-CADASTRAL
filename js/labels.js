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

// AUACAD - Export PDF : capture centrée sur la géométrie réellement rendue, sans déformation.
(function () {
    function wait(ms){ return new Promise(function(resolve){ setTimeout(resolve,ms); }); }
    function safeValue(value){ return value === null || value === undefined || value === '' ? '-' : String(value); }
    function waitForMapMovement(){
        return new Promise(function(resolve){
            var done=false;
            function finish(){ if(done)return; done=true; resolve(); }
            map.once('moveend',finish);
            setTimeout(finish,1200);
        });
    }
    function niceScaleFloor(value) {
        if (!isFinite(value) || value <= 0) return 10;
        var exponent = Math.floor(Math.log10(value));
        var fraction = value / Math.pow(10, exponent);
        var niceFraction = fraction >= 5 ? 5 : (fraction >= 2 ? 2 : 1);
        return niceFraction * Math.pow(10, exponent);
    }

    async function exportFicheParcellaire(layer) {
        if (!layer || !layer.feature || !layer.getBounds) {
            alert("Impossible d'identifier la parcelle sélectionnée.");
            return;
        }

        var p=layer.feature.properties || {};
        var oldCenter=map.getCenter();
        var oldZoom=map.getZoom();
        var popup=layer.getPopup ? layer.getPopup() : null;
        var popupWasOpen=!!(popup && popup.isOpen && popup.isOpen());
        var mapElement=document.getElementById('map');
        var hiddenControls=[];

        try {
            map.closePopup();

            var parcelBounds=layer.getBounds();
            var parcelCenter=parcelBounds.getCenter();
            var targetZoom=map.getBoundsZoom(parcelBounds.pad(4.0),false);
            targetZoom=Math.min(targetZoom,20);
            map.setView(parcelCenter,targetZoom,{animate:false});
            await waitForMapMovement();
            map.panTo(parcelCenter,{animate:false});
            await wait(350);

            // Seul le vrai contour Leaflet est renforcé, sans redessin dans le PDF.
            layer.setStyle({ color:'#e00000', weight:6, opacity:1, fillOpacity:0 });
            if (layer.bringToFront) layer.bringToFront();
            await wait(80);

            // Centre de la parcelle basé sur sa position réellement rendue dans le SVG Leaflet.
            // Cette méthode corrige le décalage que peut produire html2canvas avec les transformations Leaflet.
            var mapRect=mapElement.getBoundingClientRect();
            var renderedCenter=null;
            if (layer._path && layer._path.getBoundingClientRect) {
                var pathRect=layer._path.getBoundingClientRect();
                renderedCenter={
                    x:(pathRect.left + pathRect.right)/2 - mapRect.left,
                    y:(pathRect.top + pathRect.bottom)/2 - mapRect.top
                };
            }
            if (!renderedCenter || !isFinite(renderedCenter.x) || !isFinite(renderedCenter.y)) {
                renderedCenter=map.latLngToContainerPoint(parcelCenter);
            }

            // Masquer seulement l'interface de la webmap.
            ['.leaflet-control-container','.leaflet-popup','#map-title','#map-info-btn','#map-info-box','#coord-toggle-btn','#coord-search-box'].forEach(function(selector){
                document.querySelectorAll(selector).forEach(function(el){
                    hiddenControls.push({el:el,display:el.style.display});
                    el.style.display='none';
                });
            });
            await wait(150);

            var canvas=await html2canvas(mapElement,{
                useCORS:true,
                allowTaint:false,
                scale:2,
                backgroundColor:'#ffffff',
                logging:false
            });

            // ------------------------------------------------------------
            // RECADRAGE SANS DEFORMATION
            // Le recadrage est centré sur la position réellement rendue de la parcelle.
            // Le ratio de l'image recadrée est strictement celui du cadre PDF.
            // ------------------------------------------------------------
            var frameW=180;
            var frameH=160;
            var targetRatio=frameW/frameH;
            var cssW=mapElement.clientWidth;
            var cssH=mapElement.clientHeight;
            var scaleX=canvas.width/cssW;
            var scaleY=canvas.height/cssH;

            var cropCssW, cropCssH;
            if ((cssW/cssH) > targetRatio) {
                cropCssH = cssH * 0.88;
                cropCssW = cropCssH * targetRatio;
            } else {
                cropCssW = cssW * 0.88;
                cropCssH = cropCssW / targetRatio;
            }

            // On centre d'abord la fenêtre exactement sur la parcelle.
            // Si le recadrage touche un bord, on réduit légèrement la fenêtre plutôt que de décaler la parcelle.
            var maxHalfW=Math.min(renderedCenter.x, cssW-renderedCenter.x);
            var maxHalfH=Math.min(renderedCenter.y, cssH-renderedCenter.y);
            var allowedW=Math.max(80, maxHalfW*2);
            var allowedH=Math.max(80, maxHalfH*2);
            if (cropCssW>allowedW || cropCssH>allowedH) {
                var reduction=Math.min(allowedW/cropCssW, allowedH/cropCssH);
                cropCssW*=reduction;
                cropCssH*=reduction;
            }

            var cropCssX=renderedCenter.x-cropCssW/2;
            var cropCssY=renderedCenter.y-cropCssH/2;

            var cropCanvas=document.createElement('canvas');
            cropCanvas.width=Math.max(1,Math.round(cropCssW*scaleX));
            cropCanvas.height=Math.max(1,Math.round(cropCssH*scaleY));
            var cropCtx=cropCanvas.getContext('2d');
            cropCtx.drawImage(
                canvas,
                Math.round(cropCssX*scaleX),
                Math.round(cropCssY*scaleY),
                Math.round(cropCssW*scaleX),
                Math.round(cropCssH*scaleY),
                0,0,cropCanvas.width,cropCanvas.height
            );
            var imgData=cropCanvas.toDataURL('image/png');

            var doc=new window.jspdf.jsPDF('portrait','mm','a4');

            // En-tête et informations.
            doc.setTextColor(25,25,25);
            doc.setFont('helvetica','bold');
            doc.setFontSize(17);
            doc.text('FICHE PARCELLAIRE - AUACAD',15,16);
            doc.setDrawColor(45,105,155);
            doc.setLineWidth(0.5);
            doc.line(15,21,195,21);

            doc.setFontSize(10.5);
            var y=30;
            [['Lot',p.lot],['Nature',p.nature],['Cercle',p.cercle],['Localité',p.localite],['Surface (m²)',p['Aire m²']],['TF Global',p['TF Global']]].forEach(function(row){
                doc.setFont('helvetica','bold'); doc.text(row[0]+' :',15,y);
                doc.setFont('helvetica','normal'); doc.text(safeValue(row[1]),48,y);
                y+=7;
            });

            // Plan : aucune déformation, cadre gris.
            var planX=15;
            var planY=78;
            doc.addImage(imgData,'PNG',planX,planY,frameW,frameH);
            doc.setDrawColor(125,125,125);
            doc.setLineWidth(0.45);
            doc.rect(planX,planY,frameW,frameH);

            // Flèche du nord réduite et grise.
            var nx=planX+frameW-8;
            var ny=planY+10;
            doc.setTextColor(105,105,105);
            doc.setFont('helvetica','bold');
            doc.setFontSize(8.5);
            doc.text('N',nx,ny-4,{align:'center'});
            doc.setFillColor(105,105,105);
            doc.triangle(nx,ny-2,nx-2.8,ny+6.5,nx+2.8,ny+6.5,'F');

            // Echelle dynamique plus petite et entièrement grise.
            var midY=cssH/2;
            var p0=map.containerPointToLatLng([cssW/2-50,midY]);
            var p1=map.containerPointToLatLng([cssW/2+50,midY]);
            var metersPerCssPixel=map.distance(p0,p1)/100;
            var mmPerCssPixel=frameW/cropCssW;
            var desiredMeters=34/mmPerCssPixel*metersPerCssPixel;
            var scaleMeters=niceScaleFloor(desiredMeters);
            var scaleBarMm=(scaleMeters/metersPerCssPixel)*mmPerCssPixel;
            scaleBarMm=Math.min(scaleBarMm,38);

            var sx=planX+frameW-scaleBarMm-5;
            var sy=planY+frameH-7;
            var segments=4;
            var segW=scaleBarMm/segments;
            doc.setFont('helvetica','normal');
            doc.setFontSize(6.3);
            doc.setTextColor(105,105,105);
            for (var s=0;s<segments;s++) {
                if (s%2===0) doc.setFillColor(115,115,115); else doc.setFillColor(235,235,235);
                doc.setDrawColor(115,115,115);
                doc.rect(sx+s*segW,sy,segW,2.2,'FD');
            }
            for (var t=0;t<=segments;t++) {
                var val=Math.round((scaleMeters/segments)*t);
                doc.text(String(val),sx+t*segW,sy-1.1,{align:'center'});
            }
            doc.text('m',sx+scaleBarMm+2.2,sy+1.9);

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

            // Pied de page.
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
            map.setView(oldCenter,oldZoom,{animate:false});
            if (popupWasOpen && layer.openPopup) setTimeout(function(){ layer.openPopup(); },150);
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