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

// AUACAD - Export PDF : capture centrée, cadrée et sans aucune déformation.
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

            // Centrer réellement la parcelle dans la carte avant la capture.
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

            // Masquer seulement l'interface de la webmap.
            ['.leaflet-control-container','.leaflet-popup','#map-title','#map-info-btn','#map-info-box','#coord-toggle-btn','#coord-search-box'].forEach(function(selector){
                document.querySelectorAll(selector).forEach(function(el){
                    hiddenControls.push({el:el,display:el.style.display});
                    el.style.display='none';
                });
            });
            await wait(150);

            // Capture complète de la carte.
            var canvas=await html2canvas(mapElement,{
                useCORS:true,
                allowTaint:false,
                scale:2,
                backgroundColor:'#ffffff',
                logging:false
            });

            // ------------------------------------------------------------
            // RECADRAGE SANS DEFORMATION
            // On découpe une fenêtre centrée sur la parcelle, avec exactement
            // le même rapport largeur/hauteur que le cadre du PDF.
            // Aucune mise à l'échelle dissociée X/Y n'est appliquée.
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
                cropCssH = cssH * 0.90;
                cropCssW = cropCssH * targetRatio;
            } else {
                cropCssW = cssW * 0.90;
                cropCssH = cropCssW / targetRatio;
            }

            var centerPt=map.latLngToContainerPoint(parcelCenter);
            var cropCssX=Math.max(0, Math.min(cssW-cropCssW, centerPt.x-cropCssW/2));
            var cropCssY=Math.max(0, Math.min(cssH-cropCssH, centerPt.y-cropCssH/2));

            var cropCanvas=document.createElement('canvas');
            cropCanvas.width=Math.round(cropCssW*scaleX);
            cropCanvas.height=Math.round(cropCssH*scaleY);
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

            // Plan : image et cadre ont exactement le même ratio -> aucune déformation.
            var planX=15;
            var planY=78;
            doc.addImage(imgData,'PNG',planX,planY,frameW,frameH);
            doc.setDrawColor(35,35,35);
            doc.setLineWidth(0.6);
            doc.rect(planX,planY,frameW,frameH);

            // Flèche du nord, en haut à droite du cadre.
            var nx=planX+frameW-10;
            var ny=planY+13;
            doc.setTextColor(10,10,10);
            doc.setFont('helvetica','bold');
            doc.setFontSize(11);
            doc.text('N',nx,ny-6,{align:'center'});
            doc.setFillColor(10,10,10);
            doc.triangle(nx,ny-3,nx-4,ny+9,nx+4,ny+9,'F');

            // Echelle dynamique calculée depuis la vraie carte Leaflet.
            var midY=cssH/2;
            var p0=map.containerPointToLatLng([cssW/2-50,midY]);
            var p1=map.containerPointToLatLng([cssW/2+50,midY]);
            var metersPerCssPixel=map.distance(p0,p1)/100;
            var mmPerCssPixel=frameW/cropCssW;
            var desiredMeters=50/mmPerCssPixel*metersPerCssPixel;
            var scaleMeters=niceScaleFloor(desiredMeters);
            var scaleBarMm=(scaleMeters/metersPerCssPixel)*mmPerCssPixel;
            scaleBarMm=Math.min(scaleBarMm,55);

            var sx=planX+frameW-scaleBarMm-6;
            var sy=planY+frameH-9;
            var segments=4;
            var segW=scaleBarMm/segments;
            doc.setFont('helvetica','normal');
            doc.setFontSize(7.5);
            doc.setTextColor(20,20,20);
            for (var s=0;s<segments;s++) {
                if (s%2===0) doc.setFillColor(0,0,0); else doc.setFillColor(255,255,255);
                doc.setDrawColor(0,0,0);
                doc.rect(sx+s*segW,sy,segW,3,'FD');
            }
            for (var t=0;t<=segments;t++) {
                var val=Math.round((scaleMeters/segments)*t);
                doc.text(String(val),sx+t*segW,sy-1.5,{align:'center'});
            }
            doc.text('m',sx+scaleBarMm+3,sy+2.5);

            // Légende : uniquement le numéro du lot.
            var lx=planX+7;
            var ly=planY+frameH-11;
            doc.setFillColor(255,255,255);
            doc.setDrawColor(210,210,210);
            doc.rect(lx-3,ly-5,27,10,'FD');
            doc.setDrawColor(224,0,0);
            doc.setLineWidth(0.9);
            doc.rect(lx,ly-2.5,7,5);
            doc.setTextColor(20,20,20);
            doc.setFont('helvetica','normal');
            doc.setFontSize(9);
            doc.text(safeValue(p.lot),lx+10,ly+1);

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