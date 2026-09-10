// ============================================================
// AUACAD - EXPORT PDF V3 LEGER
// - aucun clonage de carte Leaflet ;
// - aucun html2canvas ;
// - aucun fond de carte/tuiles pendant l'export ;
// - rendu vectoriel direct dans un canvas temporaire ;
// - parcelle sélectionnée au centre géométrique exact du cadre ;
// - échelle normalisée 1:500 / 1:1000 / 1:2000 / 1:5000 ;
// - cotation automatique des côtés de la parcelle sélectionnée ;
// - aucune déformation : 900 x 800 px -> 180 x 160 mm.
// ============================================================
(function () {
    function safeValue(value) { return value === null || value === undefined || value === '' ? '-' : String(value); }
    function cleanFilePart(value) {
        var text = safeValue(value);
        if (text.normalize) text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return text.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
    }
    function collectRings(latlngs,out){out=out||[];if(!Array.isArray(latlngs)||!latlngs.length)return out;if(latlngs[0]&&typeof latlngs[0].lat==='number'){out.push(latlngs);return out;}latlngs.forEach(function(item){collectRings(item,out);});return out;}
    function getClickedRing(layer,clickLatLng){var rings=collectRings(layer.getLatLngs?layer.getLatLngs():[],[]);if(!rings.length)return null;var chosen=null,bestDistance=Infinity;rings.forEach(function(ring){if(!ring||ring.length<3)return;var b=L.latLngBounds(ring);if(clickLatLng&&b.contains(clickLatLng)){var d=map.distance(b.getCenter(),clickLatLng);if(d<bestDistance){bestDistance=d;chosen=ring;}}});if(!chosen&&clickLatLng){rings.forEach(function(ring){if(!ring||ring.length<3)return;var b=L.latLngBounds(ring),d=map.distance(b.getCenter(),clickLatLng);if(d<bestDistance){bestDistance=d;chosen=ring;}});}return chosen||rings[0];}
    function choosePrintScale(properties,ring){var area=Number(properties['Aire m²']),scale=500;if(isFinite(area)){if(area>2000)scale=2000;else if(area>500)scale=1000;}if(!ring||!ring.length)return scale;var b=L.latLngBounds(ring),center=b.getCenter();var parcelW=map.distance(L.latLng(center.lat,b.getWest()),L.latLng(center.lat,b.getEast()));var parcelH=map.distance(L.latLng(b.getSouth(),center.lng),L.latLng(b.getNorth(),center.lng));var scales=[500,1000,2000,5000];for(var i=0;i<scales.length;i++){if(scales[i]<scale)continue;var groundW=0.180*scales[i],groundH=0.160*scales[i];if(parcelW<=groundW*0.65&&parcelH<=groundH*0.65)return scales[i];}return 5000;}
    function geographicWindow(center,groundW,groundH){var R=6378137,latRad=center.lat*Math.PI/180,halfLatDeg=(groundH/2)/R*180/Math.PI,cosLat=Math.max(0.000001,Math.cos(latRad)),halfLngDeg=(groundW/2)/(R*cosLat)*180/Math.PI;return L.latLngBounds([center.lat-halfLatDeg,center.lng-halfLngDeg],[center.lat+halfLatDeg,center.lng+halfLngDeg]);}
    function latLngToPixel(latlng,center,groundW,groundH,canvasW,canvasH){var R=6378137,lat0=center.lat*Math.PI/180,dLat=(latlng.lat-center.lat)*Math.PI/180,dLng=(latlng.lng-center.lng)*Math.PI/180;return{x:canvasW/2+(R*Math.cos(lat0)*dLng/groundW)*canvasW,y:canvasH/2-(R*dLat/groundH)*canvasH};}
    function drawRing(ctx,ring,center,groundW,groundH,canvasW,canvasH,strokeStyle,lineWidth){if(!ring||ring.length<2)return;ctx.beginPath();for(var i=0;i<ring.length;i++){var pt=latLngToPixel(ring[i],center,groundW,groundH,canvasW,canvasH);if(i===0)ctx.moveTo(pt.x,pt.y);else ctx.lineTo(pt.x,pt.y);}ctx.closePath();ctx.strokeStyle=strokeStyle;ctx.lineWidth=lineWidth;ctx.stroke();}

    function drawDimensions(ctx,ring,center,groundW,groundH,canvasW,canvasH){
        if(!ring||ring.length<2)return;
        var limit=ring.length;
        if(limit>1&&ring[0].lat===ring[limit-1].lat&&ring[0].lng===ring[limit-1].lng)limit--;
        if(limit<2)return;
        var points=[];var cx=0,cy=0;
        for(var i=0;i<limit;i++){var pp=latLngToPixel(ring[i],center,groundW,groundH,canvasW,canvasH);points.push(pp);cx+=pp.x;cy+=pp.y;}
        cx/=limit;cy/=limit;ctx.font='bold 14px Arial';ctx.textAlign='center';ctx.textBaseline='middle';
        for(var j=0;j<limit;j++){
            var k=(j+1)%limit;var a=points[j],b=points[k];var dx=b.x-a.x,dy=b.y-a.y;var segPx=Math.sqrt(dx*dx+dy*dy);if(segPx<18)continue;
            var distance=map.distance(ring[j],ring[k]);if(!isFinite(distance))continue;
            var mx=(a.x+b.x)/2,my=(a.y+b.y)/2;var nx=-dy/segPx,ny=dx/segPx;var toCentroidX=cx-mx,toCentroidY=cy-my;
            if(nx*toCentroidX+ny*toCentroidY<0){nx=-nx;ny=-ny;}
            var offset=14;var tx=mx+nx*offset,ty=my+ny*offset;var angle=Math.atan2(dy,dx);if(angle>Math.PI/2||angle<-Math.PI/2)angle+=Math.PI;
            var label=distance.toFixed(2)+' m';ctx.save();ctx.translate(tx,ty);ctx.rotate(angle);var tw=ctx.measureText(label).width;ctx.fillStyle='rgba(255,255,255,0.92)';ctx.fillRect(-tw/2-3,-8,tw+6,16);ctx.fillStyle='#3d3d3d';ctx.fillText(label,0,0);ctx.restore();
        }
    }

    function renderPlanCanvas(selectedCenter,selectedRing,printScale){var canvasW=900,canvasH=800,groundW=0.180*printScale,groundH=0.160*printScale,viewBounds=geographicWindow(selectedCenter,groundW,groundH).pad(0.03),canvas=document.createElement('canvas');canvas.width=canvasW;canvas.height=canvasH;var ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvasW,canvasH);ctx.lineJoin='round';ctx.lineCap='round';if(typeof layer_AUACAD_4!=='undefined'&&layer_AUACAD_4.eachLayer){layer_AUACAD_4.eachLayer(function(parcelLayer){if(!parcelLayer||!parcelLayer.getBounds||!parcelLayer.getLatLngs)return;try{var b=parcelLayer.getBounds();if(!b||!b.isValid||!b.isValid()||!viewBounds.intersects(b))return;collectRings(parcelLayer.getLatLngs(),[]).forEach(function(ring){drawRing(ctx,ring,selectedCenter,groundW,groundH,canvasW,canvasH,'#707070',1.35);});}catch(e){}});}if(selectedRing){drawRing(ctx,selectedRing,selectedCenter,groundW,groundH,canvasW,canvasH,'#e00000',4.5);drawDimensions(ctx,selectedRing,selectedCenter,groundW,groundH,canvasW,canvasH);}return canvas;}

    function utmZoneFromLongitude(lng){return Math.max(1,Math.min(60,Math.floor((lng+180)/6)+1));}
    function getUTMVertices(ring,center){if(typeof proj4==='undefined'||!ring||!ring.length)return null;var zone=utmZoneFromLongitude(center.lng);var north=center.lat>=0;var utm='+proj=utm +zone='+zone+' +datum=WGS84 +units=m +no_defs'+(north?'':' +south');var vertices=[];var limit=ring.length;if(limit>1&&ring[0].lat===ring[limit-1].lat&&ring[0].lng===ring[limit-1].lng)limit--;for(var i=0;i<limit;i++){var xy=proj4('EPSG:4326',utm,[ring[i].lng,ring[i].lat]);vertices.push({point:'P'+(i+1),x:xy[0],y:xy[1]});}return {zone:zone,hemisphere:north?'N':'S',vertices:vertices};}

    function drawCoordinateTable(doc,utmData,startY,maxRowsFirstPage){
        if(!utmData||!utmData.vertices||!utmData.vertices.length)return;var rows=utmData.vertices;var title='Coordonnées des sommets — WGS 84 / UTM zone '+utmData.zone+utmData.hemisphere;var left=15,totalW=180,rowH=3.0,colW=[22,79,79];var maxRows=maxRowsFirstPage||8;
        function drawBlock(pageRows,y,titleText){doc.setTextColor(85,85,85);doc.setFont('helvetica','bold');doc.setFontSize(6.8);doc.text(titleText,left,y);y+=2.2;doc.setDrawColor(185,185,185);doc.setLineWidth(0.18);doc.setFillColor(246,246,246);doc.rect(left,y,totalW,rowH,'FD');var x1=left+colW[0],x2=x1+colW[1];doc.line(x1,y,x1,y+rowH*(pageRows.length+1));doc.line(x2,y,x2,y+rowH*(pageRows.length+1));doc.setTextColor(90,90,90);doc.setFont('helvetica','bold');doc.setFontSize(6.2);doc.text('Point',left+colW[0]/2,y+2.05,{align:'center'});doc.text('Est X (m)',x1+colW[1]/2,y+2.05,{align:'center'});doc.text('Nord Y (m)',x2+colW[2]/2,y+2.05,{align:'center'});for(var i=0;i<pageRows.length;i++){var ry=y+rowH*(i+1);doc.setFillColor(255,255,255);doc.rect(left,ry,totalW,rowH,'FD');doc.line(x1,ry,x1,ry+rowH);doc.line(x2,ry,x2,ry+rowH);doc.setTextColor(95,95,95);doc.setFont('helvetica','normal');doc.setFontSize(6);doc.text(pageRows[i].point,left+colW[0]/2,ry+2.05,{align:'center'});doc.text(pageRows[i].x.toFixed(2),x1+colW[1]-3,ry+2.05,{align:'right'});doc.text(pageRows[i].y.toFixed(2),x2+colW[2]-3,ry+2.05,{align:'right'});}}
        if(rows.length<=maxRows){drawBlock(rows,startY,title);return;}
        doc.setTextColor(110,110,110);doc.setFont('helvetica','italic');doc.setFontSize(6.2);doc.text(title+' — voir tableau complet page 2',left,startY);doc.addPage('a4','portrait');doc.setTextColor(25,25,25);doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text('COORDONNÉES DES SOMMETS - '+safeValue(rows.length)+' POINTS',15,18);doc.setDrawColor(45,105,155);doc.setLineWidth(0.4);doc.line(15,23,195,23);var y=31;var perPage=65;var index=0;while(index<rows.length){var chunk=rows.slice(index,index+perPage);if(index>0){doc.addPage('a4','portrait');y=18;}drawBlock(chunk,y,title);index+=chunk.length;}
    }

    async function exportFicheParcellaireV3(sourceLayer){
        if(!sourceLayer||!sourceLayer.feature||!sourceLayer.getLatLngs){alert("Impossible d'identifier la parcelle sélectionnée.");return;}
        try{
            var p=sourceLayer.feature.properties||{};var clickLatLng=(map._popup&&map._popup.getLatLng)?map._popup.getLatLng():null;var selectedRing=getClickedRing(sourceLayer,clickLatLng);var selectedBounds=selectedRing?L.latLngBounds(selectedRing):sourceLayer.getBounds();var selectedCenter=selectedBounds.getCenter();var printScale=choosePrintScale(p,selectedRing);var canvas=renderPlanCanvas(selectedCenter,selectedRing,printScale);var imgData=canvas.toDataURL('image/png');var doc=new window.jspdf.jsPDF('portrait','mm','a4');var now=new Date();var printDate=String(now.getDate()).padStart(2,'0')+'/'+String(now.getMonth()+1).padStart(2,'0')+'/'+now.getFullYear();var utmData=getUTMVertices(selectedRing,selectedCenter);
            doc.setTextColor(25,25,25);doc.setFont('helvetica','bold');doc.setFontSize(17);doc.text('Fiche parcellaire MLCad',15,16);
            doc.setDrawColor(45,105,155);doc.setLineWidth(0.5);doc.line(15,21,195,21);doc.setFontSize(10.5);var y=30;
            [['Lot',p.lot],['Nature',p.nature],['Cercle',p.cercle],['Localité',p.localite],['Surface (m²)',p['Aire m²']],['TF Global',p['TF Global']],['Échelle','1:'+printScale]].forEach(function(row){doc.setFont('helvetica','bold');doc.text(row[0]+' :',15,y);doc.setFont('helvetica','normal');doc.text(safeValue(row[1]),48,y);y+=7;});
            var planX=15,planY=82,frameW=180,frameH=160;doc.addImage(imgData,'PNG',planX,planY,frameW,frameH);doc.setDrawColor(0,0,0);doc.setLineWidth(0.6);doc.rect(planX,planY,frameW,frameH);var nx=planX+frameW-8,ny=planY+10;doc.setTextColor(120,120,120);doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text('N',nx,ny-4,{align:'center'});doc.setFillColor(120,120,120);doc.triangle(nx,ny-2,nx-2.6,ny+6,nx+2.6,ny+6,'F');var lx=planX+6,ly=planY+frameH-9;doc.setFillColor(255,255,255);doc.setDrawColor(190,190,190);doc.setLineWidth(0.2);doc.rect(lx-2.5,ly-4.5,23,8.5,'FD');doc.setDrawColor(224,0,0);doc.setLineWidth(0.8);doc.rect(lx,ly-2.1,6,4.2);doc.setTextColor(90,90,90);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text(safeValue(p.lot),lx+8.5,ly+0.9);
            doc.setTextColor(125,125,125);doc.setFont('helvetica','normal');doc.setFontSize(6.2);doc.text("Date d'impression : "+printDate,planX+frameW,planY+frameH+4,{align:'right'});
            drawCoordinateTable(doc,utmData,250,5);
            doc.setDrawColor(45,105,155);doc.setLineWidth(0.35);doc.line(15,274,195,274);doc.setTextColor(80,80,80);doc.setFontSize(7.5);doc.text('Document généré depuis la webmap AUACAD - usage indicatif',15,281);
            var fileName='Fiche_'+cleanFilePart(p.lot)+'_'+cleanFilePart(p['TF Global'])+'_'+cleanFilePart(p.localite)+'.pdf';doc.save(fileName);
        }catch(error){console.error('Erreur export PDF AUACAD V3 :',error);alert("Une erreur est survenue pendant la génération de la fiche PDF.");}
    }
    document.addEventListener('click',function(event){var button=event.target.closest?event.target.closest('.pdf-btn'):null;if(!button)return;event.preventDefault();event.stopPropagation();if(event.stopImmediatePropagation)event.stopImmediatePropagation();var sourceLayer=map&&map._popup?map._popup._source:null;exportFicheParcellaireV3(sourceLayer);},true);
})();