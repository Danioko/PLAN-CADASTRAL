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
    if (layer.getTooltip()) {
        var label = layer.getTooltip()._source._tooltip._container;
        if (label) {
            var rect = label.getBoundingClientRect();
            var bottomLeft = map.containerPointToLatLng([rect.left, rect.bottom]);
            var topRight = map.containerPointToLatLng([rect.right, rect.top]);
            var boundingBox = {
                bottomLeft : [bottomLeft.lng, bottomLeft.lat],
                topRight   : [topRight.lng, topRight.lat]
            };

            labelEngine.ingestLabel(
                boundingBox,
                id,
                parseInt(Math.random() * (5 - 1) + 1),
                label,
                "Test " + id,
                false
            );

            if (!layer.added) {
                layer.addTo(map);
                layer.added = true;
            }
        }
    }
}

// ============================================================
// AUACAD - FICHE PARCELLAIRE PDF V3
// Informations uniquement en haut à gauche + parcelle garantie
// en surbrillance sur le plan, même si html2canvas ne capture pas
// correctement les vecteurs SVG Leaflet.
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

    function flattenLatLngs(latlngs, result) {
        result = result || [];
        if (!latlngs) return result;

        if (Array.isArray(latlngs) && latlngs.length && latlngs[0] && typeof latlngs[0].lat === 'number') {
            result.push(latlngs);
            return result;
        }

        if (Array.isArray(latlngs)) {
            latlngs.forEach(function(item) {
                flattenLatLngs(item, result);
            });
        }
        return result;
    }

    function drawLeafletPolygonOnPdf(doc, leafletLayer, mapRect, pageRect, fillSelected) {
        if (!leafletLayer || !leafletLayer.getLatLngs) return;

        var rings = flattenLatLngs(leafletLayer.getLatLngs());
        if (!rings.length) return;

        var sx = pageRect.w / mapRect.w;
        var sy = pageRect.h / mapRect.h;

        rings.forEach(function(ring) {
            if (!ring || ring.length < 3) return;

            var points = ring.map(function(latlng) {
                var pt = map.latLngToContainerPoint(latlng);
                return {
                    x: pageRect.x + pt.x * sx,
                    y: pageRect.y + pt.y * sy
                };
            });

            var first = points[0];
            var deltas = [];
            for (var i = 1; i < points.length; i++) {
                deltas.push([
                    points[i].x - points[i - 1].x,
                    points[i].y - points[i - 1].y
                ]);
            }
            deltas.push([
                first.x - points[points.length - 1].x,
                first.y - points[points.length - 1].y
            ]);

            if (fillSelected) {
                doc.setFillColor(255, 220, 80);
                doc.setDrawColor(220, 35, 35);
                doc.setLineWidth(1.1);
                doc.lines(deltas, first.x, first.y, [1, 1], 'FD', true);
            } else {
                doc.setDrawColor(125, 125, 125);
                doc.setLineWidth(0.25);
                doc.lines(deltas, first.x, first.y, [1, 1], 'S', true);
            }
        });
    }

    async function exportFicheParcellaireV3(layer) {
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
            map.closePopup();

            // Zoom suffisant pour voir la parcelle et son voisinage immédiat.
            var bounds = layer.getBounds();
            map.fitBounds(bounds.pad(1.35), { animate: false, maxZoom: 21 });
            await waitForMapMovement();
            await wait(300);

            // Style temporaire visible à l'écran pendant la préparation.
            layer.setStyle({
                color: '#dc2323',
                weight: 5,
                opacity: 1,
                fillColor: '#ffdc50',
                fillOpacity: 0.78
            });
            if (layer.bringToFront) layer.bringToFront();

            // Masquer popup et contrôles pour la capture.
            var selectors = [
                '.leaflet-control-container',
                '.leaflet-popup',
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

            await wait(120);

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

            // ==============================
            // EN-TÊTE ET INFORMATIONS
            // ==============================
            doc.setTextColor(25, 25, 25);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(17);
            doc.text('FICHE PARCELLAIRE - AUACAD', 15, 16);

            doc.setDrawColor(45, 105, 155);
            doc.setLineWidth(0.5);
            doc.line(15, 21, 195, 21);

            doc.setFontSize(10.5);
            var y = 30;
            var lineGap = 7;
            var infoRows = [
                ['Lot', p.lot],
                ['Nature', p.nature],
                ['Cercle', p.cercle],
                ['Localité', p.localite],
                ['Surface (m²)', p['Aire m²']],
                ['TF Global', p['TF Global']]
            ];

            infoRows.forEach(function(row) {
                doc.setFont('helvetica', 'bold');
                doc.text(row[0] + ' :', 15, y);
                doc.setFont('helvetica', 'normal');
                doc.text(safeValue(row[1]), 48, y);
                y += lineGap;
            });

            // ==============================
            // GRAND PLAN DE SITUATION
            // ==============================
            var pageRect = {
                x: 15,
                y: 78,
                w: 180,
                h: 180
            };

            doc.setDrawColor(110, 110, 110);
            doc.setLineWidth(0.35);
            doc.rect(pageRect.x, pageRect.y, pageRect.w, pageRect.h);
            doc.addImage(imgData, 'PNG', pageRect.x, pageRect.y, pageRect.w, pageRect.h);

            // Le fond de carte est une image, mais les parcelles sont redessinées
            // directement dans le PDF pour garantir leur visibilité.
            var mapRect = {
                w: mapElement.clientWidth,
                h: mapElement.clientHeight
            };

            // Parcelles voisines : contours seulement, sans libellés ni détails.
            if (typeof layer_AUACAD_4 !== 'undefined' && layer_AUACAD_4.eachLayer) {
                layer_AUACAD_4.eachLayer(function(parcelLayer) {
                    if (parcelLayer === layer) return;
                    if (!parcelLayer.getBounds || !parcelLayer.getLatLngs) return;
                    try {
                        if (map.getBounds().intersects(parcelLayer.getBounds())) {
                            drawLeafletPolygonOnPdf(doc, parcelLayer, mapRect, pageRect, false);
                        }
                    } catch (e) {}
                });
            }

            // Parcelle concernée : remplissage jaune + contour rouge.
            drawLeafletPolygonOnPdf(doc, layer, mapRect, pageRect, true);

            // Petite légende, sans reprendre les attributs.
            doc.setFillColor(255, 220, 80);
            doc.setDrawColor(220, 35, 35);
            doc.setLineWidth(0.7);
            doc.rect(20, 245, 8, 5, 'FD');
            doc.setTextColor(40, 40, 40);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.text('Parcelle concernée', 31, 249);

            // Pied de page.
            doc.setDrawColor(45, 105, 155);
            doc.setLineWidth(0.35);
            doc.line(15, 274, 195, 274);
            doc.setTextColor(80, 80, 80);
            doc.setFontSize(7.5);
            doc.text('Document généré depuis la webmap AUACAD - usage indicatif', 15, 281);

            doc.save('Fiche_Parcelle_' + safeValue(p.lot).replace(/[^a-zA-Z0-9_-]/g, '_') + '.pdf');
        } catch (error) {
            console.error('Erreur export PDF AUACAD :', error);
            alert("Une erreur est survenue pendant la génération de la fiche PDF.");
        } finally {
            hiddenControls.forEach(function(item) {
                item.el.style.display = item.display;
            });

            if (typeof layer_AUACAD_4 !== 'undefined' && layer_AUACAD_4.resetStyle) {
                layer_AUACAD_4.resetStyle(layer);
            }

            map.setView(oldCenter, oldZoom, { animate: false });

            if (popupWasOpen && layer.openPopup) {
                setTimeout(function() { layer.openPopup(); }, 150);
            }
        }
    }

    document.addEventListener('click', function(event) {
        var button = event.target.closest ? event.target.closest('.pdf-btn') : null;
        if (!button) return;

        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();

        var sourceLayer = map && map._popup ? map._popup._source : null;
        exportFicheParcellaireV3(sourceLayer);
    }, true);
})();