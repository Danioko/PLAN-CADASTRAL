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
    for (var j = 0; j < markers.length; j++) {
        markers[j].eachLayer(function(label){ addLabel(label, ++i); });
    }
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

// AUACAD - Export PDF : capture fidèle de la carte, sans redessiner les parcelles.
(function () {
    function wait(ms) { return new Promise(function(resolve){ setTimeout(resolve,ms); }); }
    function safeValue(value) { return value === null || value === undefined || value === '' ? '-' : String(value); }
    function waitForMapMovement() {
        return new Promise(function(resolve){
            var done=false;
            function finish(){ if(done)return; done=true; resolve(); }
            map.once('moveend',finish);
            setTimeout(finish,1200);
        });
    }

    async function exportFicheParcellaire(layer) {
        if (!layer || !layer.feature || !layer.getBounds) {
            alert("Impossible d'identifier la parcelle sélectionnée.");
            return;
        }
        var p = layer.feature.properties || {};
        var oldCenter = map.getCenter();
        var oldZoom = map.getZoom();
        var popup = layer.getPopup ? layer.getPopup() : null;
        var popupWasOpen = !!(popup && popup.isOpen && popup.isOpen());
        var mapElement = document.getElementById('map');
        var hiddenControls=[];

        try {
            map.closePopup();

            // Cadrer uniquement la parcelle et son voisinage proche.
            map.fitBounds(layer.getBounds().pad(1.45), {animate:false, maxZoom:21});
            await waitForMapMovement();
            await wait(300);

            // NE PAS REDESSINER : on modifie seulement le style du vrai objet Leaflet.
            // Pas de remplissage : seul le contour rouge épais identifie la parcelle.
            layer.setStyle({
                color:'#e00000',
                weight:6,
                opacity:1,
                fillOpacity:0
            });
            if (layer.bringToFront) layer.bringToFront();

            // Cacher uniquement les éléments d'interface, jamais les couches cadastrales.
            ['.leaflet-control-container','.leaflet-popup','#map-title','#map-info-btn','#map-info-box','#coord-toggle-btn','#coord-search-box'].forEach(function(selector){
                document.querySelectorAll(selector).forEach(function(el){
                    hiddenControls.push({el:el,display:el.style.display});
                    el.style.display='none';
                });
            });
            await wait(150);

            // Capture unique de la carte telle qu'elle est réellement affichée.
            var canvas = await html2canvas(mapElement, {
                useCORS:true,
                allowTaint:false,
                scale:2,
                backgroundColor:'#ffffff',
                logging:false
            });
            var imgData=canvas.toDataURL('image/png');
            var doc=new window.jspdf.jsPDF('portrait','mm','a4');

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
                doc.setFont('helvetica','bold');
                doc.text(row[0]+' :',15,y);
                doc.setFont('helvetica','normal');
                doc.text(safeValue(row[1]),48,y);
                y+=7;
            });

            // Le PDF reçoit uniquement l'image capturée : aucune géométrie n'est ajoutée par-dessus.
            var planX=15, planY=78, planW=180, planH=180;
            doc.setDrawColor(110,110,110);
            doc.setLineWidth(0.35);
            doc.rect(planX,planY,planW,planH);
            doc.addImage(imgData,'PNG',planX,planY,planW,planH);

            doc.setDrawColor(45,105,155);
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