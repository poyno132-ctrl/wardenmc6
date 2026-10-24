// Fiyatlar ve ürünler tek yerde: sunucu fiyatı buradan alır, tarayıcıya güvenmez.
module.exports={
  coin:[
    {id:'c100',n:'100 Coin',d:'Başlangıç paketi.',coin:100,tl:29},
    {id:'c500',n:'550 Coin',d:'500 coin + 50 bonus.',coin:550,tl:129,c:'amber'},
    {id:'c1000',n:'1150 Coin',d:'1000 coin + 150 bonus.',coin:1150,tl:239,c:'violet'},
    {id:'c2500',n:'3000 Coin',d:'2500 coin + 500 bonus.',coin:3000,tl:549}
  ],
  rank:[
    {id:'r_sculk',n:'Sculk',d:'Renkli isim ve 2 ekstra ev.',p:250},
    {id:'r_sentinel',n:'Sentinel',d:'Sculk avantajları, lobide uçuş ve sohbet etiketi.',p:600,c:'amber'},
    {id:'r_warden',n:'Warden',d:'5 ekstra ev ve öncelikli giriş.',p:1200,c:'violet'},
    {id:'r_deepdark',n:'Deep Dark',d:'Tüm avantajlar ve haftalık kasa anahtarı.',p:2500}
  ],
  key:[
    {id:'k_sculk1',n:'Sculk Kasası x1',d:'Sık çıkan eşyalar, şanslıysan nadir ödül.',p:40},
    {id:'k_ancient1',n:'Ancient Kasası x1',d:'Nadir eşyalar ve büyülü ekipman.',p:90,c:'amber'},
    {id:'k_warden1',n:'Warden Kasası x1',d:'Efsanevi ödüller ve set parçaları.',p:200,c:'violet'},
    {id:'k_ender1',n:'Ender Kasası x1',d:'Ender temalı eşyalar, özel efektler ve nadir ödüller.',p:140}
  ],
  set:[
    {id:'s_sculk',n:'Sculk Seti',d:'Zırh, kılıç ve kazma. Sculk parıltılı.',p:450},
    {id:'s_ancient',n:'Ancient City Seti',d:'Büyülü tam set ve özel efekt.',p:700,c:'amber'},
    {id:'s_warden',n:'Warden Seti',d:'Özel yetenekler ve parçacık efekti.',p:900,c:'violet'}
  ]
};
