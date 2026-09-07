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

// Charger le nouvel export AVANT la fin du parsing de la page.
// Il utilise une carte Leaflet temporaire indépendante afin d'assurer
// un centrage exact de la parcelle et de ne jamais déplacer la webmap.
document.write('<script src="js/pdf-export-v2.js"><\\/script>');

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