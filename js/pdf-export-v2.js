// ============================================================
// AUACAD - EXPORT PDF V4
// - rendu léger en canvas ;
// - fond de plan actif repris dans l'export quand il autorise CORS ;
// - parcelle sélectionnée centrée au cadre ;
// - échelle normalisée ;
// - aucune déformation ;
// - cadre noir, parcellaire gris, parcelle sélectionnée rouge.
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
                if (d < bestDistance) { bestDistance = d; chosen = ring; }
            }
        });

        if (!chosen && clickLatLng) {
            rings.forEach(function(ring) {
                if (!ring || ring.length < 3) return;
                var b = L.latLngBounds(ring);
                var d = map.distance(b.getCenter(), clickLatLng);
                if (d < bestDistance) { bestDistance = d; chosen = ring; }
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
        return {
            x: canvasW / 2 + (R * Math.cos(lat0) * dLng / groundW) * canvasW,
            y: canvasH / 2 - (R * dLat / groundH) * canvasH
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

    function getActiveTileLayer() {
        var active = null;
        if (!map || !map.eachLayer) return null;
        map.eachLayer(function(layer) {
            if (typeof L !== 'undefined' && layer instanceof L.TileLayer && map.hasLayer(layer) && layer._url) {
                active = layer;
            }
        });
        return active;
    }

    function tileXY(lat, lng, z) {
        var n = Math.pow(2, z);
        var latRad = lat * Math.PI / 180;
        return {
            x: (lng + 180) / 360 * n,
            y: (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n
        };
    }

    function tileLatLng(x, y, z) {
        var n = Math.pow(2, z);
        var lng = x / n * 360 - 180;
        var latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
        return L.latLng(latRad * 180 / Math.PI, lng);
    }

    function tileUrl(layer, x, y, z) {
        var url = layer._url;
        var maxY = Math.pow(2, z) - 1;
        var subdomains = layer.options && layer.options.subdomains;
        var s = 'a';
        if (Array.isArray(subdomains) && subdomains.length) s = subdomains[0];
        else if (typeof subdomains === 'string' && subdomains.length) s = subdomains.charAt(0);

        if (layer.options && layer.options.tms) y = maxY - y;

        return url
            .replace('{s}', s)
            .replace('{z}', z)
            .replace('{x}', x)
            .replace('{y}', y)
            .replace('{-y}', maxY - y)
            .replace('{r}', '');
    }

    function loadImage(url, timeoutMs) {
        return new Promise(function(resolve) {
            var img = new Image();
            var settled = false;
            var timer = setTimeout(function() {
                if (settled) return;
                settled = true;
                resolve(null);
            }, timeoutMs || 1800);

            img.crossOrigin = 'anonymous';
            img.onload = function() {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(img);
            };
            img.onerror = function() {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(null);
            };
            img.src = url;
        });
    }

    async function drawActiveBasemap(ctx, center, groundW, groundH, canvasW, canvasH) {
        var layer = getActiveTileLayer();
        if (!layer) return false;

        var targetMpp = groundW / canvasW;
        var initialResolution = 156543.03392804097 * Math.cos(center.lat * Math.PI / 180);
        var z = Math.round(Math.log(initialResolution / targetMpp) / Math.LN2);
        var minZoom = isFinite(layer.options.minZoom) ? layer.options.minZoom : 0;
        var maxZoom = isFinite(layer.options.maxNativeZoom) ? layer.options.maxNativeZoom : (isFinite(layer.options.maxZoom) ? layer.options.maxZoom : 22);
        z = Math.max(minZoom, Math.min(maxZoom, z));

        var view = geographicWindow(center, groundW, groundH);
        var nwTile = tileXY(view.getNorth(), view.getWest(), z);
        var seTile = tileXY(view.getSouth(), view.getEast(), z);
        var minX = Math.floor(nwTile.x);
        var maxX = Math.floor(seTile.x);
        var minY = Math.floor(nwTile.y);
        var maxY = Math.floor(seTile.y);

        var jobs = [];
        for (var x = minX; x <= maxX; x++) {
            for (var y = minY; y <= maxY; y++) {
                jobs.push({x:x, y:y, url:tileUrl(layer, x, y, z)});
            }
        }

        var results = await Promise.all(jobs.map(function(job) {
            return loadImage(job.url, 1800).then(function(img) {
                return {job:job, img:img};
            });
        }));

        var drawn = 0;
        results.forEach(function(item) {
            if (!item.img) return;
            var x = item.job.x;
            var y = item.job.y;
            var nw = tileLatLng(x, y, z);
            var se = tileLatLng(x + 1, y + 1, z);
            var p1 = latLngToPixel(nw, center, groundW, groundH, canvasW, canvasH);
            var p2 = latLngToPixel(se, center, groundW, groundH, canvasW, canvasH);
            var dx = p1.x;
            var dy = p1.y;
            var dw = p2.x - p1.x;
            var dh = p2.y - p1.y;
            try {
                ctx.drawImage(item.img, dx, dy, dw, dh);
                drawn++;
            } catch (e) {}
        });

        return drawn > 0;
    }

    async function renderPlanCanvas(selectedCenter, selectedRing, printScale) {
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

        // Fond de plan actif en premier. Si le fournisseur bloque CORS,
        // l'export reste fonctionnel et retombe sur le fond blanc.
        try {
            await drawActiveBasemap(ctx, selectedCenter, groundW, groundH, canvasW, canvasH);
        } catch (e) {
            console.warn('Fond de plan non exportable, export vectoriel conservé.', e);
        }

        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        // Parcellaire par-dessus le fond de plan.
        if (typeof layer_AUACAD_4 !== 'undefined' && layer_AUACAD_4.eachLayer) {
            layer_AUACAD_4.eachLayer(function(parcelLayer) {
                if (!parcelLayer || !parcelLayer.getBounds || !parcelLayer.getLatLngs) return;
                try {
                    var b = parcelLayer.getBounds();
                    if (!b || !b.isValid || !b.isValid() || !viewBounds.intersects(b)) return;
                    collectRings(parcelLayer.getLatLngs(), []).forEach(function(ring) {
                        drawRing(ctx, ring, selectedCenter, groundW, groundH, canvasW, canvasH, '#707070', 1.35);
                    });
                } catch (e) {}
            });
        }

        if (selectedRing) {
            drawRing(ctx, selectedRing, selectedCenter, groundW, groundH, canvasW, canvasH, '#e00000', 4.5);
        }

        return canvas;
    }

    async function exportFicheParcellaireV4(sourceLayer) {
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

            var canvas = await renderPlanCanvas(selectedCenter, selectedRing, printScale);
            var imgData;
            try {
                imgData = canvas.toDataURL('image/png');
            } catch (e) {
                // Sécurité : si un fournisseur de tuiles a contaminé le canvas,
                // refaire immédiatement le plan sans fond de carte.
                var clean = document.createElement('canvas');
                clean.width = 900; clean.height = 800;
                var cleanCtx = clean.getContext('2d');
                cleanCtx.fillStyle = '#ffffff'; cleanCtx.fillRect(0,0,900,800);
                var groundW = 0.180 * printScale;
                var groundH = 0.160 * printScale;
                var viewBounds = geographicWindow(selectedCenter, groundW, groundH).pad(0.03);
                if (typeof layer_AUACAD_4 !== 'undefined' && layer_AUACAD_4.eachLayer) {
                    layer_AUACAD_4.eachLayer(function(parcelLayer) {
                        if (!parcelLayer || !parcelLayer.getBounds || !parcelLayer.getLatLngs) return;
                        try {
                            var b=parcelLayer.getBounds();
                            if(!b||!b.isValid||!b.isValid()||!viewBounds.intersects(b))return;
                            collectRings(parcelLayer.getLatLngs(),[]).forEach(function(ring){
                                drawRing(cleanCtx,ring,selectedCenter,groundW,groundH,900,800,'#707070',1.35);
                            });
                        } catch(err) {}
                    });
                }
                if(selectedRing)drawRing(cleanCtx,selectedRing,selectedCenter,groundW,groundH,900,800,'#e00000',4.5);
                imgData = clean.toDataURL('image/png');
            }

            var doc = new window.jspdf.jsPDF('portrait', 'mm', 'a4');

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

            var planX=15, planY=82, frameW=180, frameH=160;
            doc.addImage(imgData,'PNG',planX,planY,frameW,frameH);
            doc.setDrawColor(0,0,0);
            doc.setLineWidth(0.6);
            doc.rect(planX,planY,frameW,frameH);

            var nx=planX+frameW-8, ny=planY+10;
            doc.setTextColor(120,120,120);
            doc.setFont('helvetica','bold');
            doc.setFontSize(8);
            doc.text('N',nx,ny-4,{align:'center'});
            doc.setFillColor(120,120,120);
            doc.triangle(nx,ny-2,nx-2.6,ny+6,nx+2.6,ny+6,'F');

            var lx=planX+6, ly=planY+frameH-9;
            doc.setFillColor(255,255,255);
            doc.setDrawColor(190,190,190);
            doc.setLineWidth(0.2);
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
        } catch (error) {
            console.error('Erreur export PDF AUACAD V4 :', error);
            alert("Une erreur est survenue pendant la génération de la fiche PDF.");
        }
    }

    document.addEventListener('click', function(event) {
        var button = event.target.closest ? event.target.closest('.pdf-btn') : null;
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        var sourceLayer = map && map._popup ? map._popup._source : null;
        exportFicheParcellaireV4(sourceLayer);
    }, true);
})();