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
        markers[j].eachLayer(function(label) { addLabel(label, ++i); });
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
                bottomLeft: [bottomLeft.lng, bottomLeft.lat],
                topRight: [topRight.lng, topRight.lat]
            };
            labelEngine.ingestLabel(
                boundingBox,
                id,
                parseInt(Math.random() * (5 - 1) + 1),
                label,
                'Test ' + id,
                false
            );
            if (!layer.added) {
                layer.addTo(map);
                layer.added = true;
            }
        }
    }
}

// Charger le moteur PDF avec une version explicite afin d'éviter
// que le navigateur conserve une ancienne version en cache.
document.write('<script src="js/pdf-export-v2.js?v=cotation-interieure-20260910"><\\/script>');

// En-tête moderne AUACAD : recherche et boutons réellement reliés aux outils existants.
(function () {
    function normalizeText(value) {
        var text = value === null || value === undefined ? '' : String(value);
        if (text.normalize) text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return text.toLowerCase().trim();
    }

    function toggleLayersPanel() {
        var control = document.querySelector('.leaflet-control-layers');
        var toggle = document.querySelector('.leaflet-control-layers-toggle');
        if (!control || !toggle) {
            alert('Le gestionnaire de couches n’est pas encore disponible.');
            return;
        }
        control.classList.toggle('leaflet-control-layers-expanded');
        if (control.classList.contains('leaflet-control-layers-expanded')) {
            try { toggle.focus(); } catch (e) {}
        }
    }

    function openAbout() {
        var box = document.getElementById('map-info-box');
        if (!box) return;
        box.style.display = box.style.display === 'block' ? 'none' : 'block';
    }

    function printSelectedParcel() {
        var popup = document.querySelector('.leaflet-popup');
        var button = popup ? popup.querySelector('.pdf-btn') : null;
        if (button) {
            button.click();
            return;
        }
        alert('Sélectionnez d’abord une parcelle sur la carte, puis cliquez sur Imprimer.');
    }

    function searchParcel(query) {
        query = normalizeText(query);
        if (!query) return;
        if (typeof layer_AUACAD_4 === 'undefined' || !layer_AUACAD_4.eachLayer || typeof map === 'undefined') {
            alert('La couche cadastrale n’est pas encore prête.');
            return;
        }

        var exact = null;
        var partial = null;
        layer_AUACAD_4.eachLayer(function (layer) {
            if (!layer || !layer.feature || !layer.feature.properties) return;
            var p = layer.feature.properties;
            var values = [p['TF Global'], p.lot, p.localite, p.cercle, p.nature];
            for (var i = 0; i < values.length; i++) {
                var value = normalizeText(values[i]);
                if (!value) continue;
                if (!exact && value === query) exact = layer;
                if (!partial && value.indexOf(query) !== -1) partial = layer;
            }
        });

        var result = exact || partial;
        if (!result) {
            alert('Aucune parcelle trouvée pour : ' + query);
            return;
        }

        try {
            if (result.getBounds && result.getBounds().isValid()) {
                map.fitBounds(result.getBounds().pad(1.2), { maxZoom: 20 });
            }
            setTimeout(function () {
                try { result.openPopup(); } catch (e) {}
            }, 250);
        } catch (e) {
            console.error('Recherche AUACAD :', e);
        }
    }

    function buildModernHeader() {
        var title = document.getElementById('map-title');
        if (!title) {
            setTimeout(buildModernHeader, 100);
            return;
        }

        title.innerHTML =
            '<div class="auacad-brand">' +
                '<div class="auacad-logo"><i class="fas fa-layer-group"></i></div>' +
                '<div class="auacad-name">AUACAD</div>' +
                '<div class="auacad-divider"></div>' +
                '<div class="auacad-brand-text"><strong>PLAN CADASTRAL</strong><span>Mali · Parcellaire de consultation</span></div>' +
            '</div>' +
            '<div class="auacad-search-wrap"><i class="fas fa-search"></i><input id="auacad-header-search" type="text" placeholder="Rechercher une parcelle (TF, lot, localité...)" aria-label="Rechercher une parcelle"></div>' +
            '<div class="auacad-actions">' +
                '<button type="button" id="auacad-layers-btn"><i class="fas fa-map"></i><span>Couches</span></button>' +
                '<button type="button" id="auacad-legend-btn"><i class="fas fa-layer-group"></i><span>Légende</span></button>' +
                '<button type="button" id="auacad-print-btn"><i class="fas fa-print"></i><span>Imprimer</span></button>' +
                '<button type="button" id="auacad-about-btn" class="primary"><i class="fas fa-info-circle"></i><span>À propos</span></button>' +
            '</div>';

        var oldStyle = document.getElementById('auacad-modern-title-style');
        if (oldStyle) oldStyle.remove();
        var style = document.createElement('style');
        style.id = 'auacad-modern-title-style';
        style.textContent = `
            #map-title {
                position:absolute!important;top:8px!important;left:20px!important;right:20px!important;
                transform:none!important;z-index:1800!important;height:64px!important;box-sizing:border-box!important;
                display:flex!important;align-items:center!important;gap:22px!important;padding:8px 12px!important;
                background:rgba(255,255,255,.96)!important;border:1px solid #dce5ed!important;border-radius:10px!important;
                box-shadow:0 4px 18px rgba(31,55,75,.14)!important;font-family:Arial,Helvetica,sans-serif!important;
                text-align:left!important;white-space:nowrap!important;backdrop-filter:blur(8px)!important;
            }
            #map-title::before{display:none!important}
            .auacad-brand{display:flex;align-items:center;gap:10px;flex:0 0 auto;min-width:430px}
            .auacad-logo{width:42px;height:42px;border-radius:8px;background:#0877c9;color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 3px 9px rgba(8,119,201,.25)}
            .auacad-name{font-size:21px;font-weight:800;color:#096daf;letter-spacing:.3px}
            .auacad-divider{width:1px;height:34px;background:#87a8bf;margin:0 3px}
            .auacad-brand-text{display:flex;flex-direction:column;line-height:1.1}
            .auacad-brand-text strong{font-size:18px;color:#183247;letter-spacing:.5px}
            .auacad-brand-text span{font-size:10px;color:#758695;margin-top:4px}
            .auacad-search-wrap{height:40px;flex:1 1 420px;max-width:560px;border:1px solid #ccd9e3;border-radius:8px;background:#fff;display:flex;align-items:center;padding:0 12px;gap:10px;box-sizing:border-box}
            .auacad-search-wrap i{color:#0877c9;font-size:15px}
            #auacad-header-search{width:100%;border:0;outline:0;background:transparent;font-size:13px;color:#243746;font-family:inherit}
            #auacad-header-search::placeholder{color:#8a9aa7}
            .auacad-actions{margin-left:auto;display:flex;align-items:center;gap:5px;flex:0 0 auto}
            .auacad-actions button{height:40px;padding:0 11px;border:0;border-radius:7px;background:transparent;color:#096daf;cursor:pointer;font-size:12px;font-weight:700;font-family:inherit;display:flex;align-items:center;gap:7px;transition:.15s ease}
            .auacad-actions button:hover{background:#edf6fc}
            .auacad-actions button.primary{background:#0877c9;color:white;padding:0 14px}
            .auacad-actions button.primary:hover{background:#0667ae}
            .auacad-actions i{font-size:15px}

            /* Harmonisation avec les contrôles Leaflet existants */
            #map-info-btn{display:none!important}
            .leaflet-control-layers:not(.leaflet-control-layers-expanded){display:none!important}
            .leaflet-top.leaflet-left{top:76px!important;z-index:1600!important}
            .leaflet-top.leaflet-left .leaflet-control{display:block!important;visibility:visible!important;opacity:1!important}

            @media(max-width:1150px){.auacad-brand{min-width:auto}.auacad-brand-text span{display:none}.auacad-actions button span{display:none}.auacad-actions button{width:40px;justify-content:center;padding:0}.auacad-actions button.primary{padding:0;width:40px}.auacad-search-wrap{max-width:none}}
            @media(max-width:760px){#map-title{left:8px!important;right:8px!important;height:56px!important;gap:8px!important;padding:7px!important}.auacad-logo{width:36px;height:36px}.auacad-name{font-size:17px}.auacad-divider,.auacad-brand-text{display:none}.auacad-search-wrap{height:36px;min-width:0;padding:0 9px}.auacad-search-wrap input{font-size:11px}.auacad-actions{gap:2px}.auacad-actions button{width:34px;height:36px}.auacad-actions #auacad-legend-btn{display:none}.leaflet-top.leaflet-left{top:66px!important}}
        `;
        document.head.appendChild(style);

        var input = document.getElementById('auacad-header-search');
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') searchParcel(input.value);
        });
        document.getElementById('auacad-layers-btn').addEventListener('click', toggleLayersPanel);
        document.getElementById('auacad-legend-btn').addEventListener('click', toggleLayersPanel);
        document.getElementById('auacad-print-btn').addEventListener('click', printSelectedParcel);
        document.getElementById('auacad-about-btn').addEventListener('click', openAbout);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildModernHeader);
    } else {
        buildModernHeader();
    }
})();

// Désactiver la surbrillance et l'ouverture des informations au survol.
// Les informations restent disponibles au clic sur la parcelle.
(function () {
    function disableHoverInteraction() {
        if (typeof layer_AUACAD_4 === 'undefined' || !layer_AUACAD_4.eachLayer) {
            setTimeout(disableHoverInteraction, 250);
            return;
        }
        layer_AUACAD_4.eachLayer(function(parcelLayer) {
            parcelLayer.off('mouseover');
            parcelLayer.off('mouseout');
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(disableHoverInteraction, 250);
        });
    } else {
        setTimeout(disableHoverInteraction, 250);
    }
})();