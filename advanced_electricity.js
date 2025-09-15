if (!globalThis.advancedElectricityModLoaded) {
globalThis.advancedElectricityModLoaded = true;

const ADJ = adjacentCoords;
function neighborsOf(p){let a=[];for(let d of ADJ){let col = pixelMap[p.x + d[0]]; if(col){ let n = col[p.y + d[1]]; if(n) a.push(n);} } return a;}
function ensureCharge(p){if(p && p.charge==undefined) p.charge = 0;}
function transfer(a,b,rate){
  if(!a||!b) return;
  ensureCharge(a); ensureCharge(b);
  let diff = a.charge - b.charge;
  let t = diff * rate;
  if(Math.abs(t) < 0.01) return;
  a.charge = Math.max(0, a.charge - t);
  b.charge = Math.max(0, b.charge + t);
}
function pushToNeighbors(p,amount){
  if(!p) return;
  ensureCharge(p);
  let n = neighborsOf(p);
  let receivers = n.filter(x=>x && x.element && (x.element==="wire"||x.element==="insulated_wire"||x.element==="battery"||x.element==="power_node"||x.element.endsWith("_consumer")));
  if(receivers.length === 0) return;
  let per = amount / receivers.length;
  for(let r of receivers){ ensureCharge(r); r.charge = Math.min(1000, r.charge + per); p.charge = Math.max(0, p.charge - per); }
}

elements.wire = {
  color:"#9b9b9b",
  behavior:behaviors.WALL,
  category:"energy",
  state:"solid",
  tick:function(pixel){
    ensureCharge(pixel);
    let n = neighborsOf(pixel);
    for(let nb of n){
      if(nb && nb.charge !== undefined){
        transfer(pixel, nb, 0.25);
      }
    }
    if(pixel.charge > 120) { pixel.charge = 120; if(Math.random() < 0.002){ createPixel("spark", pixel.x, pixel.y-1); } }
  },
  desc:"Condutor elétrico padrão. Equilibra carga com vizinhos."
};

elements.insulated_wire = {
  color:"#444444",
  behavior:behaviors.WALL,
  category:"energy",
  state:"solid",
  tick:function(pixel){
    ensureCharge(pixel);
    let n = neighborsOf(pixel);
    for(let nb of n){
      if(nb && (nb.element==="insulated_wire"||nb.element==="power_node")) transfer(pixel, nb, 0.5);
    }
    if(pixel.charge > 200) pixel.charge = 200;
  },
  desc:"Fio isolado: só conecta com outros fios isolados e nós."
};

elements.power_node = {
  color:"#6666ff",
  behavior:behaviors.WALL,
  category:"energy",
  state:"solid",
  capacity:400,
  tick:function(pixel){
    pixel.charge ??= 0;
    let n = neighborsOf(pixel);
    for(let nb of n){ if(nb && nb.charge !== undefined) transfer(nb, pixel, 0.15); }
    for(let nb of n){ if(nb && (nb.element==="wire"||nb.element==="insulated_wire")) transfer(pixel, nb, 0.2); }
    if(pixel.charge > pixel.capacity) pixel.charge = pixel.capacity;
  },
  desc:"Nodo de distribuição com alta capacidade."
};

elements.battery = {
  color:"#2b2bff",
  behavior:behaviors.WALL,
  category:"energy",
  state:"solid",
  capacity:250,
  tick:function(pixel){
    pixel.charge ??= Math.min(60, pixel.charge||0);
    let n = neighborsOf(pixel);
    for(let nb of n){
      if(nb && nb.charge!==undefined){
        if(nb.charge > pixel.charge && pixel.charge < pixel.capacity) transfer(nb, pixel, 0.25);
        else if(pixel.charge > nb.charge && nb.element==="wire") transfer(pixel, nb, 0.12);
      }
    }
    if(pixel.charge > pixel.capacity) pixel.charge = pixel.capacity;
  },
  desc:"Bateria que armazena energia para consumo posterior."
};

elements.coal_generator = {
  color:"#222222",
  behavior:behaviors.WALL,
  category:"energy",
  state:"solid",
  burnRate:1,
  tick:function(pixel){
    pixel.charge ??= 0;
    let n = neighborsOf(pixel);
    for(let nb of n){
      if(nb && nb.element === "coal"){ deletePixel(nb.x, nb.y); pixel.charge = Math.min(1000, pixel.charge + 120); break; }
    }
    pushToNeighbors(pixel, 8);
    if(pixel.charge > 900) { if(Math.random()<0.01) createPixel("smoke", pixel.x, pixel.y-1); pixel.charge = 900; }
  },
  desc:"Gerador que consome carvão ao redor para produzir energia."
};

elements.steam_generator = {
  color:"#2f6f6f",
  behavior:behaviors.WALL,
  category:"energy",
  state:"solid",
  tick:function(pixel){
    pixel.charge ??= 0;
    let n = neighborsOf(pixel);
    for(let nb of n){
      if(nb && nb.element === "water"){
        if(Math.random() < 0.02){ deletePixel(nb.x, nb.y); pixel.charge = Math.min(1000, pixel.charge + 50); createPixel("steam", pixel.x, pixel.y-1); }
      }
    }
    pushToNeighbors(pixel, 3);
  },
  desc:"Gera energia consumindo água e emitindo vapor."
};

elements.solar_panel = {
  color:"#19a119",
  behavior:behaviors.WALL,
  category:"energy",
  state:"solid",
  tick:function(pixel){
    pixel.charge ??= 0;
    let hour = (new Date()).getHours();
    if(hour >= 7 && hour <= 18){
      pixel.charge = Math.min(1000, pixel.charge + 0.9);
      if(Math.random() < 0.01) createPixel("spark", pixel.x, pixel.y-1);
    }
    pushToNeighbors(pixel, 1.2);
  },
  desc:"Painel solar: gera durante o dia (usa hora real do sistema)."
};

elements.electric_motor = {
  color:"#ff8a00",
  behavior:behaviors.WALL,
  category:"energy",
  state:"solid",
  efficiency:0.75,
  tick:function(pixel){
    pixel.charge ??= 0;
    if(pixel.charge > 5){
      pixel.charge -= 5;
      if(Math.random() < 0.15) createPixel("smoke", pixel.x, pixel.y-1);
      let dir = Math.random() < 0.5 ? 1 : -1;
      let tx = pixel.x + dir;
      let ty = pixel.y;
      let col = pixelMap[tx]?.[ty];
      if(col && col.element && col.element !== "wire" && col.element !== "insulated_wire"){
        let el = col.element;
        deletePixel(tx, ty);
        if(Math.random() < 0.5) createPixel(el, pixel.x, pixel.y);
        else createPixel(el, pixel.x + dir*2, pixel.y);
      }
    }
    else if(pixel.charge > 0 && Math.random() < 0.02) { createPixel("spark", pixel.x, pixel.y-1); }
  },
  desc:"Motor elétrico: consome energia e aplica pequena força mecânica a pixels vizinhos."
};

elements.electric_lamp_consumer = {
  color:"#ffd966",
  behavior:behaviors.WALL,
  category:"energy",
  state:"solid",
  tick:function(pixel){
    pixel.charge ??= 0;
    if(pixel.charge > 2){
      pixel.charge -= 1;
      if(Math.random() < 0.1) createPixel("spark", pixel.x, pixel.y-1);
      if(Math.random() < 0.05) createPixel("light_particle", pixel.x, pixel.y-1);
    }
  },
  desc:"Lâmpada elétrica: consome energia e gera partículas de luz."
};

elements.electric_heater_consumer = {
  color:"#ff4444",
  behavior:behaviors.WALL,
  category:"energy",
  state:"solid",
  tick:function(pixel){
    pixel.charge ??= 0;
    if(pixel.charge > 3){
      pixel.charge -= 2;
      let above = pixelMap[pixel.x]?.[pixel.y-1];
      if(!above || above.element === "air") createPixel("fire", pixel.x, pixel.y-1);
    }
  },
  desc:"Aquecedor elétrico: consome energia e produz fogo acima."
};

elements.relay_switch = {
  color:"#aaaa22",
  behavior:behaviors.WALL,
  category:"energy",
  state:"solid",
  tick:function(pixel){
    pixel.on ??= false;
    pixel.charge ??= 0;
    let n = neighborsOf(pixel);
    let powered = n.some(x=>x && x.charge !== undefined && x.charge > 20);
    if(powered && !pixel.on){ pixel.on = true; pixel.charge = Math.min(500, pixel.charge + 40); }
    if(!powered && pixel.on) pixel.on = false;
    if(pixel.on){ for(let nb of n){ if(nb && nb.element && nb.element.endsWith("_consumer")) transfer(pixel, nb, 0.2); } }
  },
  desc:"Relé/switch: ativa consumidores próximos quando recebe energia."
};

      }
  
