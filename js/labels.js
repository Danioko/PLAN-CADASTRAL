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
document.write('<script src="js/pdf-export-v2.js?v=cotation-20260910"><\\/script>');

// Titre moderne de la webcarte, sans modifier les contrôles Leaflet existants.
(function () {
    function modernizeMapTitle() {
        var title = document.getElementById('map-title');
        if (!title) {
            setTimeout(modernizeMapTitle, 100);
            return;
        }

        title.innerHTML =
            '<div class="auacad-title-badge">AUACAD</div>' +
            '<div class="auacad-title-main">PLAN CADASTRAL</div>' +
            '<div class="auacad-title-sub">Mali · Consultation parcellaire</div>';

        var style = document.createElement('style');
        style.id = 'auacad-modern-title-style';
        style.textContent = `
            #map-title {
                position: absolute !important;
                top: 14px !important;
                left: 50% !important;
                transform: translateX(-50%) !important;
                z-index: 1000 !important;
                display: flex !important;
                align-items: center !important;
                gap: 10px !important;
                min-width: 0 !important;
                max-width: calc(100vw - 180px) !important;
                padding: 9px 14px !important;
                background: rgba(255,255,255,0.94) !important;
                border: 1px solid rgba(18,72,118,0.14) !important;
                border-radius: 14px !important;
                box-shadow: 0 8px 24px rgba(20,49,72,0.16) !important;
                backdrop-filter: blur(10px) !important;
                -webkit-backdrop-filter: blur(10px) !important;
                font-family: Arial, Helvetica, sans-serif !important;
                text-align: left !important;
                line-height: 1.05 !important;
                white-space: nowrap !important;
            }
            #map-title::before {
                content: '';
                width: 4px;
                align-self: stretch;
                min-height: 34px;
                border-radius: 999px;
                background: linear-gradient(180deg,#0b6fb8,#21a6d8);
                flex: 0 0 auto;
            }
            #map-title .auacad-title-badge {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                height: 28px;
                padding: 0 9px;
                border-radius: 8px;
                background: #0b6fb8;
                color: #fff;
                font-size: 10px;
                font-weight: 700;
                letter-spacing: 1.2px;
                flex: 0 0 auto;
            }
            #map-title .auacad-title-main {
                color: #183247;
                font-size: 18px;
                font-weight: 800;
                letter-spacing: .4px;
                flex: 0 0 auto;
            }
            #map-title .auacad-title-sub {
                color: #71808d;
                font-size: 10px;
                font-weight: 500;
                padding-left: 10px;
                border-left: 1px solid #dce4ea;
                flex: 0 0 auto;
            }
            @media (max-width: 760px) {
                #map-title {
                    top: 10px !important;
                    max-width: calc(100vw - 110px) !important;
                    padding: 7px 10px !important;
                    gap: 7px !important;
                }
                #map-title .auacad-title-badge {
                    height: 24px;
                    padding: 0 7px;
                    font-size: 8px;
                }
                #map-title .auacad-title-main {
                    font-size: 14px;
                }
                #map-title .auacad-title-sub {
                    display: none;
                }
            }
        `;

        var oldStyle = document.getElementById('auacad-modern-title-style');
        if (oldStyle) oldStyle.remove();
        document.head.appendChild(style);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', modernizeMapTitle);
    } else {
        modernizeMapTitle();
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