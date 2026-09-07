// ============================================================
// AUACAD - EXPORT PDF V2
// Génère une carte Leaflet indépendante de la webmap principale.
// La parcelle sélectionnée est centrée dans une fenêtre d'impression
// 900 x 800 px (même ratio que 180 x 160 mm) à une échelle normalisée.
// ============================================================
(function () {
    function wait(ms) {
        return new Promise(function(resolve) { setTimeout(resolve, ms); });
    }

    function safeValue(value) {
        return value === null || value === undefined || value === '' ? '-' : String(value);
    }

    function collectRings(latlngs, out) {
        out = out || [];
        if (!Array.isArray(latlngs) || !latlngs.length) return out;
        if (latlngs[0] && typeof latlngs[0].lat === 'number') {
            out.push(latlngs);
            return out;
        }
        latlngs.forEach(function(item) { collectRings(item, out); });
        return out;
    }

    function getClickedRing(layer, clickLatLng) {
        var rings = collectRings(layer.getLatLngs ? layer.getLatLngs() : [], []);
        if (!rings.length) return null;

        var chosen = null;
        var bestDistance = Infinity;

        rings.forEach(function(ring) {
            if (!ring || ring.length < 3) return;
            var b = L.latLngBounds(ring);
            if (clickLatLng && b.contains(clickLatLng)) {
                var d = map.distance(b.getCenter(), clickLatLng);
                if (d < bestDistance) {
                    bestDistance = d;
                    chosen = ring;
                }
            }
        });

        if (!chosen && clickLatLng) {
            rings.forEach(function(ring) {
                if (!ring || ring.length < 3) return;
                var b = L.latLngBounds(ring);
                var d = map.distance(b.getCenter(), clickLatLng);
                if (d < bestDistance) {
                    bestDistance = d;
                    chosen = ring;
                }
            });
        }

        return chosen || rings[0];
    }

    function choosePrintScale(properties, ring) {
        var area = Number(properties['Aire m²']);
        var scale = 500;
        if (isFinite(area)) {
            if (area > 2000) scale = 2000;
            else if (area > 500) scale = 1000;
        }

        if (!ring || !ring.length) return scale;
        var b = L.latLngBounds(ring);
        var center = b.getCenter();
        var parcelW = map.distance(L.latLng(center.lat, b.getWest()), L.latLng(center.lat, b.getEast()));
        var parcelH = map.distance(L.latLng(b.getSouth(), center.lng), L.latLng(b.getNorth(), center.lng));
        var scales = [500, 1000, 2000, 5000];

        for (var i = 0; i < scales.length; i++) {
            if (scales[i] < scale) continue;
            var groundW = 0.180 * scales[i];
            var groundH = 0.160 * scales[i];
            if (parcelW <= groundW * 0.65 && parcelH <= groundH * 0.65) return scales[i];
        }
        return 5000;
    }

    function zoomForScale(latitude, scaleDenominator, cssWidthPx, frameWidthMm) {
        var groundWidthMeters = (frameWidthMm / 1000) * scaleDenominator;
        var desiredMetersPerPixel = groundWidthMeters / cssWidthPx;
        var initialResolution = 156543.03392804097 * Math.cos(latitude * Math.PI / 180);
        return Math.log(initialResolution / desiredMetersPerPixel) / Math.LN2;
    }

    function defaultParcelStyle(feature) {
        return {
            color: '#666666',
            weight: 1,
            opacity: 0.9,
            fillColor: '#ffffff',
            fillOpacity: 0
        };
    }

    function cloneVisibleTileLayers(sourceMap, targetMap) {
        var clones = [];
        sourceMap.eachLayer(function(layer) {
            if (!(layer instanceof L.TileLayer) || !sourceMap.hasLayer(layer) || !layer._url) return;
            try {
                var options = {
                    minZoom: layer.options.minZoom,
                    maxZoom: layer.options.maxZoom,
                    maxNativeZoom: layer.options.maxNativeZoom,
                    tileSize: layer.options.tileSize,
                    zoomOffset: layer.options.zoomOffset,
                    opacity: layer.options.opacity,
                    attribution: '',
                    crossOrigin: layer.options.crossOrigin || true
                };
                var clone = L.tileLayer(layer._url, options).addTo(targetMap);
                clones.push(clone);
            } catch (e) {
                console.warn('Fond de carte non cloné pour export PDF', e);
            }
        });
        return clones;
    }

    function waitForTiles(tileLayers, timeoutMs) {
        return new Promise(function(resolve) {
            if (!tileLayers.length) {
                resolve();
                return;
            }
            var pending = tileLayers.length;
            var finished = false;
            function done() {
                if (finished) return;
                pending--;
                if (pending <= 0) {
                    finished = true;
                    resolve();
                }
            }
            tileLayers.forEach(function(layer) {
                if (layer.isLoading && !layer.isLoading()) done();
                else layer.once('load', done);
            });
            setTimeout(function() {
                if (!finished) {
                    finished = true;
                    resolve();
                }
            }, timeoutMs || 1800);
        });
    }

    async function exportFicheParcellaireV2(sourceLayer) {
        if (!sourceLayer || !sourceLayer.feature || !sourceLayer.getLatLngs) {
            alert("Impossible d'identifier la parcelle sélectionnée.");
            return;
        }

        var p = sourceLayer.feature.properties || {};
        var clickLatLng = (map._popup && map._popup.getLatLng) ? map._popup.getLatLng() : null;
        var selectedRing = getClickedRing(sourceLayer, clickLatLng);
        var selectedBounds = selectedRing ? L.latLngBounds(selectedRing) : sourceLayer.getBounds();
        var selectedCenter = selectedBounds.getCenter();
        var printScale = choosePrintScale(p, selectedRing);

        var printWpx = 900;
        var printHpx = 800;
        var printDiv = document.createElement('div');
        printDiv.id = 'auacad-print-map-v2';
        printDiv.style.width = printWpx + 'px';
        printDiv.style.height = printHpx + 'px';
        printDiv.style.position = 'fixed';
        printDiv.style.left = '-10000px';
        printDiv.style.top = '0';
        printDiv.style.margin = '0';
        printDiv.style.padding = '0';
        printDiv.style.background = '#ffffff';
        printDiv.style.zIndex = '-9999';
        document.body.appendChild(printDiv);

        var printMap = null;
        try {
            printMap = L.map(printDiv, {
                zoomControl: false,
                attributionControl: false,
                zoomSnap: 0,
                zoomDelta: 0.25,
                zoomAnimation: false,
                fadeAnimation: false,
                markerZoomAnimation: false,
                preferCanvas: false
            });

            var tileLayers = cloneVisibleTileLayers(map, printMap);

            // Une seule copie des parcelles : pas de superposition avec la webmap principale.
            if (typeof layer_AUACAD_4 !== 'undefined' && layer_AUACAD_4.toGeoJSON) {
                L.geoJSON(layer_AUACAD_4.toGeoJSON(), {
                    style: defaultParcelStyle,
                    interactive: false
                }).addTo(printMap);
            }

            var printZoom = zoomForScale(selectedCenter.lat, printScale, printWpx, 180);
            printMap.setView(selectedCenter, printZoom, { animate: false });
            printMap.invalidateSize(false);
            printMap.setView(selectedCenter, printZoom, { animate: false });

            // Contour rouge uniquement sur la parcelle choisie.
            if (selectedRing) {
                L.polygon(selectedRing, {
                    color: '#e00000',
                    weight: 5,
                    opacity: 1,
                    fillOpacity: 0,
                    interactive: false
                }).addTo(printMap).bringToFront();
            }

            await waitForTiles(tileLayers, 2200);
            await wait(350);

            // Vérification finale : le centre cartographique correspond exactement au centre de la parcelle.
            printMap.setView(selectedCenter, printZoom, { animate: false });
            await wait(120);

            var canvas = await html2canvas(printDiv, {
                useCORS: true,
                allowTaint: false,
                scale: 2,
                width: printWpx,
                height: printHpx,
                backgroundColor: '#ffffff',
                logging: false
            });

            var imgData = canvas.toDataURL('image/png');
            var doc = new window.jspdf.jsPDF('portrait', 'mm', 'a4');

            doc.setTextColor(25, 25, 25);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(17);
            doc.text('FICHE PARCELLAIRE - AUACAD', 15, 16);
            doc.setDrawColor(45, 105, 155);
            doc.setLineWidth(0.5);
            doc.line(15, 21, 195, 21);

            doc.setFontSize(10.5);
            var y = 30;
            [
                ['Lot', p.lot],
                ['Nature', p.nature],
                ['Cercle', p.cercle],
                ['Localité', p.localite],
                ['Surface (m²)', p['Aire m²']],
                ['TF Global', p['TF Global']],
                ['Échelle', '1:' + printScale]
            ].forEach(function(row) {
                doc.setFont('helvetica', 'bold');
                doc.text(row[0] + ' :', 15, y);
                doc.setFont('helvetica', 'normal');
                doc.text(safeValue(row[1]), 48, y);
                y += 7;
            });

            var planX = 15;
            var planY = 82;
            var frameW = 180;
            var frameH = 160;
            doc.addImage(imgData, 'PNG', planX, planY, frameW, frameH);
            doc.setDrawColor(135, 135, 135);
            doc.setLineWidth(0.45);
            doc.rect(planX, planY, frameW, frameH);

            // Flèche du nord grise et discrète.
            var nx = planX + frameW - 8;
            var ny = planY + 10;
            doc.setTextColor(120, 120, 120);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.text('N', nx, ny - 4, { align: 'center' });
            doc.setFillColor(120, 120, 120);
            doc.triangle(nx, ny - 2, nx - 2.6, ny + 6, nx + 2.6, ny + 6, 'F');

            // Légende : uniquement le numéro du lot.
            var lx = planX + 6;
            var ly = planY + frameH - 9;
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(190, 190, 190);
            doc.rect(lx - 2.5, ly - 4.5, 23, 8.5, 'FD');
            doc.setDrawColor(224, 0, 0);
            doc.setLineWidth(0.8);
            doc.rect(lx, ly - 2.1, 6, 4.2);
            doc.setTextColor(90, 90, 90);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.text(safeValue(p.lot), lx + 8.5, ly + 0.9);

            doc.setDrawColor(45, 105, 155);
            doc.setLineWidth(0.35);
            doc.line(15, 274, 195, 274);
            doc.setTextColor(80, 80, 80);
            doc.setFontSize(7.5);
            doc.text('Document généré depuis la webmap AUACAD - usage indicatif', 15, 281);

            doc.save('Fiche_Parcelle_' + safeValue(p.lot).replace(/[^a-zA-Z0-9_-]/g, '_') + '.pdf');
        } catch (error) {
            console.error('Erreur export PDF AUACAD V2 :', error);
            alert("Une erreur est survenue pendant la génération de la fiche PDF.");
        } finally {
            if (printMap) {
                try { printMap.remove(); } catch (e) {}
            }
            if (printDiv && printDiv.parentNode) printDiv.parentNode.removeChild(printDiv);
        }
    }

    // Capture-phase : ce gestionnaire doit être chargé AVANT labels.js pour neutraliser l'ancien export.
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