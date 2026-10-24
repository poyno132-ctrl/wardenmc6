(function(){
  var ip=document.body.dataset.ip||'oyna.wardenmc.net';
  document.querySelectorAll('[data-copy]').forEach(function(b){
    var o=b.textContent;
    b.addEventListener('click',function(e){
      e.preventDefault();
      function ok(){b.textContent='Kopyalandı';setTimeout(function(){b.textContent=o},1600)}
      try{navigator.clipboard.writeText(ip).then(ok,ok)}catch(x){ok()}
    });
  });
  var d=document.getElementById('dust');
  if(d)for(var i=0;i<18;i++){var p=document.createElement('i');p.style.left=Math.random()*100+'%';p.style.animationDuration=(9+Math.random()*10)+'s';p.style.animationDelay=(-Math.random()*14)+'s';d.appendChild(p)}
  var s=document.getElementById('sensor'),h=document.getElementById('heard'),n=0,t;
  if(!s)return;
  var idle='Her şey sessiz.<small>Sculk sensörüne dokunmayı dene.</small>';
  var msg=['Titreşim algılandı.<small>Dikkatli ol.</small>','Yaklaşıyor...<small>Sessiz kalmak zor, değil mi?</small>','Çok yakın.<small>Bir dokunuş daha.</small>'];
  s.addEventListener('click',function(){
    n++;var r=document.createElement('span');r.className='ring';s.appendChild(r);setTimeout(function(){r.remove()},1700);
    s.classList.add('hit');setTimeout(function(){s.classList.remove('hit')},260);
    h.classList.toggle('danger',n>3);
    h.innerHTML=n<4?msg[n-1]:'Warden seni duydu.<small>Sunucuda görüşürüz: '+ip+'</small>';
    clearTimeout(t);t=setTimeout(function(){n=0;h.classList.remove('danger');h.innerHTML=idle},6000);
  });
})();
