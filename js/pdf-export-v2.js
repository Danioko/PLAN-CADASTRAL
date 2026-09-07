// ============================================================
// AUACAD - EXPORT PDF V3 LEGER
// - aucun clonage de carte Leaflet ;
// - aucun html2canvas ;
// - aucun fond de carte/tuiles pendant l'export ;
// - rendu vectoriel direct dans un canvas temporaire ;
// - parcelle sélectionnée au centre géométrique exact du cadre ;
// - échelle normalisée 1:500 / 1:1000 / 1:2000 / 1:5000 ;
// - aucune déformation : 900 x 800 px -> 180 x 160 mm.
// ============================================================
(function () {
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

    function geographicWindow(center, groundW, groundH) {
        var R = 6378137;
        var latRad = center.lat * Math.PI / 180;
        var halfLatDeg = (groundH / 2) / R * 180 / Math.PI;
        var cosLat = Math.max(0.000001, Math.cos(latRad));
        var halfLngDeg = (groundW / 2) / (R * cosLat) * 180 / Math.PI;
        return L.latLngBounds(
            [center.lat - halfLatDeg, center.lng - halfLngDeg],
            [center.lat + halfLatDeg, center.lng + halfLngDeg]
        );
    }

    function latLngToPixel(latlng, center, groundW, groundH, canvasW, canvasH) {
        var R = 6378137;
        var lat0 = center.lat * Math.PI / 180;
        var dLat = (latlng.lat - center.lat) * Math.PI / 180;
        var dLng = (latlng.lng - center.lng) * Math.PI / 180;
        var xMeters = R * Math.cos(lat0) * dLng;
        var yMeters = R * dLat;
        return {
            x: canvasW / 2 + (xMeters / groundW) * canvasW,
            y: canvasH / 2 - (yMeters / groundH) * canvasH
        };
    }

    function drawRing(ctx, ring, center, groundW, groundH, canvasW, canvasH, strokeStyle, lineWidth) {
        if (!ring || ring.length < 2) return;
        ctx.beginPath();
        for (var i = 0; i < ring.length; i++) {
            var pt = latLngToPixel(ring[i], center, groundW, groundH, canvasW, canvasH);
            if (i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
        }
        ctx.closePath();
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
    }

    function renderPlanCanvas(selectedCenter, selectedRing, printScale) {
        var canvasW = 900;
        var canvasH = 800;
        var groundW = 0.180 * printScale;
        var groundH = 0.160 * printScale;
        var viewBounds = geographicWindow(selectedCenter, groundW, groundH).pad(0.03);

        var canvas = document.createElement('canvas');
        canvas.width = canvasW;
        canvas.height = canvasH;
        var ctx = canvas.getContext('2d');

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvasW, canvasH);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        // Dessiner uniquement les parcelles qui coupent le cadre d'impression.
        // Aucun objet Leaflet n'est créé : on trace directement leurs coordonnées.
        if (typeof layer_AUACAD_4 !== 'undefined' && layer_AUACAD_4.eachLayer) {
            layer_AUACAD_4.eachLayer(function(parcelLayer) {
                if (!parcelLayer || !parcelLayer.getBounds || !parcelLayer.getLatLngs) return;
                try {
                    var b = parcelLayer.getBounds();
                    if (!b || !b.isValid || !b.isValid() || !viewBounds.intersects(b)) return;
                    var rings = collectRings(parcelLayer.getLatLngs(), []);
                    rings.forEach(function(ring) {
                        drawRing(ctx, ring, selectedCenter, groundW, groundH, canvasW, canvasH, '#707070', 1.35);
                    });
                } catch (e) {}
            });
        }

        // Parcelle sélectionnée : tracée une seule fois par-dessus le plan.
        if (selectedRing) {
            drawRing(ctx, selectedRing, selectedCenter, groundW, groundH, canvasW, canvasH, '#e00000', 4.5);
        }

        return canvas;
    }

    async function exportFicheParcellaireV3(sourceLayer) {
        if (!sourceLayer || !sourceLayer.feature || !sourceLayer.getLatLngs) {
            alert("Impossible d'identifier la parcelle sélectionnée.");
            return;
        }

        try {
            var p = sourceLayer.feature.properties || {};
            var clickLatLng = (map._popup && map._popup.getLatLng) ? map._popup.getLatLng() : null;
            var selectedRing = getClickedRing(sourceLayer, clickLatLng);
            var selectedBounds = selectedRing ? L.latLngBounds(selectedRing) : sourceLayer.getBounds();
            var selectedCenter = selectedBounds.getCenter();
            var printScale = choosePrintScale(p, selectedRing);

            // Rendu très léger : canvas vectoriel pur, sans carte Leaflet secondaire.
            var canvas = renderPlanCanvas(selectedCenter, selectedRing, printScale);
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

            // Flèche du nord petite et grise.
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
            console.error('Erreur export PDF AUACAD V3 :', error);
            alert("Une erreur est survenue pendant la génération de la fiche PDF.");
        }
    }

    // Capture-phase : neutralise l'ancien export et utilise uniquement la V3.
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