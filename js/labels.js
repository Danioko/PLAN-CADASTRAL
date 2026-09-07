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
        markers[j].eachLayer(function(label){
            addLabel(label, ++i);
        });
    }
  labelEngine.update();
}

function addLabel(layer, id) {

  // This is ugly but there is no getContainer method on the tooltip :(
  if (layer.getTooltip()) {
      var label = layer.getTooltip()._source._tooltip._container;
      if (label) {

        // We need the bounding rectangle of the label itself
        var rect = label.getBoundingClientRect();

        // We convert the container coordinates (screen space) to Lat/lng
        var bottomLeft = map.containerPointToLatLng([rect.left, rect.bottom]);
        var topRight = map.containerPointToLatLng([rect.right, rect.top]);
        var boundingBox = {
          bottomLeft : [bottomLeft.lng, bottomLeft.lat],
          topRight   : [topRight.lng, topRight.lat]
        };

        // Ingest the label into labelgun itself
        labelEngine.ingestLabel(
          boundingBox,
          id,
          parseInt(Math.random() * (5 - 1) + 1), // Weight
          label,
          "Test " + id,
          false
        );

        // If the label hasn't been added to the map already
        // add it and set the added flag to true
        if (!layer.added) {
          layer.addTo(map);
          layer.added = true;
        }
      }
  }
}

// ============================================================
// AUACAD - FICHE PARCELLAIRE PDF V2
// Parcelle sélectionnée en surbrillance + détails à côté du plan
// ============================================================
(function () {
    function wait(ms) {
        return new Promise(function(resolve) { setTimeout(resolve, ms); });
    }

    function safeValue(value) {
        return value === null || value === undefined || value === '' ? '-' : String(value);
    }

    function waitForMapMovement() {
        return new Promise(function(resolve) {
            var done = false;
            function finish() {
                if (done) return;
                done = true;
                resolve();
            }
            map.once('moveend', finish);
            setTimeout(finish, 1200);
        });
    }

    async function exportFicheParcellaireV2(layer) {
        if (!layer || !layer.feature || !layer.getBounds) {
            alert("Impossible d'identifier la parcelle sélectionnée.");
            return;
        }

        var feature = layer.feature;
        var p = feature.properties || {};
        var oldCenter = map.getCenter();
        var oldZoom = map.getZoom();
        var popup = layer.getPopup ? layer.getPopup() : null;
        var popupWasOpen = !!(popup && popup.isOpen && popup.isOpen());
        var mapElement = document.getElementById('map');
        var hiddenControls = [];

        try {
            // Fermer le popup d'origine pour qu'il n'apparaisse pas sur le plan.
            map.closePopup();

            // Mettre clairement en évidence la parcelle concernée.
            layer.setStyle({
                color: '#c62828',
                weight: 5,
                opacity: 1,
                fillColor: '#ffd54f',
                fillOpacity: 0.78
            });
            if (layer.bringToFront) layer.bringToFront();

            // Garder un contexte cadastral autour de la parcelle.
            var bounds = layer.getBounds();
            map.fitBounds(bounds.pad(1.8), { animate: false, maxZoom: 20 });
            await waitForMapMovement();
            await wait(350);

            // Masquer les contrôles de l'interface pendant la capture.
            var selectors = [
                '.leaflet-control-container',
                '#map-title',
                '#map-info-btn',
                '#map-info-box',
                '#coord-toggle-btn',
                '#coord-search-box'
            ];
            selectors.forEach(function(selector) {
                document.querySelectorAll(selector).forEach(function(el) {
                    hiddenControls.push({ el: el, display: el.style.display });
                    el.style.display = 'none';
                });
            });

            await wait(100);

            var canvas = await html2canvas(mapElement, {
                useCORS: true,
                allowTaint: false,
                scale: 2,
                backgroundColor: '#ffffff',
                logging: false
            });

            var imgData = canvas.toDataURL('image/png');
            var jsPDF = window.jspdf.jsPDF;
            var doc = new jsPDF('portrait', 'mm', 'a4');

            // En-tête
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(17);
            doc.text('FICHE PARCELLAIRE - AUACAD', 18, 18);
            doc.setDrawColor(60, 60, 60);
            doc.setLineWidth(0.4);
            doc.line(18, 23, 192, 23);

            // Sous-titre
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text('Plan de situation de la parcelle selectionnee', 18, 29);

            // Plan de situation à gauche
            var planX = 18;
            var planY = 36;
            var planW = 112;
            var planH = 128;
            doc.setDrawColor(160, 160, 160);
            doc.rect(planX, planY, planW, planH);
            doc.addImage(imgData, 'PNG', planX + 1, planY + 1, planW - 2, planH - 2);

            // Cartouche d'informations à droite du plan
            var boxX = 136;
            var boxY = 36;
            var boxW = 56;
            var boxH = 94;
            doc.setFillColor(248, 248, 248);
            doc.setDrawColor(198, 40, 40);
            doc.setLineWidth(0.8);
            doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, 'FD');

            doc.setTextColor(198, 40, 40);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.text('PARCELLE ' + safeValue(p.lot), boxX + 5, boxY + 10);

            doc.setTextColor(30, 30, 30);
            doc.setFontSize(8.5);
            var rows = [
                ['Lot', p.lot],
                ['Nature', p.nature],
                ['Cercle', p.cercle],
                ['Localite', p.localite],
                ['Surface', safeValue(p['Aire m²']) + ' m2'],
                ['TF Global', p['TF Global']]
            ];
            var y = boxY + 22;
            rows.forEach(function(row) {
                doc.setFont('helvetica', 'bold');
                doc.text(row[0] + ' :', boxX + 5, y);
                doc.setFont('helvetica', 'normal');
                var valueLines = doc.splitTextToSize(safeValue(row[1]), boxW - 10);
                doc.text(valueLines, boxX + 5, y + 4.5);
                y += 12 + Math.max(0, valueLines.length - 1) * 4;
            });

            // Légende de la surbrillance
            doc.setFillColor(255, 213, 79);
            doc.setDrawColor(198, 40, 40);
            doc.setLineWidth(0.7);
            doc.rect(136, 139, 8, 6, 'FD');
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(30, 30, 30);
            doc.text('Parcelle concernee', 147, 144);

            // Note et pied de page
            doc.setFontSize(8);
            doc.setTextColor(80, 80, 80);
            doc.text('La parcelle concernee est mise en surbrillance sur le plan de situation.', 18, 174);
            doc.line(18, 278, 192, 278);
            doc.setFontSize(7.5);
            doc.text('Document genere depuis la webmap AUACAD - usage indicatif', 18, 284);

            doc.save('Fiche_Parcelle_' + safeValue(p.lot).replace(/[^a-zA-Z0-9_-]/g, '_') + '.pdf');
        } catch (error) {
            console.error('Erreur export PDF AUACAD :', error);
            alert("Une erreur est survenue pendant la génération de la fiche PDF.");
        } finally {
            // Restaurer l'interface.
            hiddenControls.forEach(function(item) {
                item.el.style.display = item.display;
            });

            // Restaurer le style d'origine de la parcelle.
            if (typeof layer_AUACAD_4 !== 'undefined' && layer_AUACAD_4.resetStyle) {
                layer_AUACAD_4.resetStyle(layer);
            }

            // Restaurer l'emprise de carte initiale.
            map.setView(oldCenter, oldZoom, { animate: false });

            // Rouvrir le popup si l'utilisateur l'avait ouvert.
            if (popupWasOpen && layer.openPopup) {
                setTimeout(function() { layer.openPopup(); }, 150);
            }
        }
    }

    // Le bouton PDF est créé dynamiquement dans le popup qgis2web.
    // L'écoute en phase de capture remplace proprement l'ancien export
    // sans modifier le reste de la carte.
    document.addEventListener('click', function(event) {
        var button = event.target.closest ? event.target.closest('.pdf-btn') : null;
        if (!button) return;

        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();

        var sourceLayer = map && map._popup ? map._popup._source : null;
        exportFicheParcellaireV2(sourceLayer);
    }, true);
})();