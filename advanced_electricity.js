// advancedElectricityMod.js
(function(){
  if (globalThis.advancedElectricityModLoaded) return;
  globalThis.advancedElectricityModLoaded = true;

  // init only when sandboxels environment is ready
  function init(){
    if (typeof elements === "undefined" || typeof behaviors === "undefined" || typeof pixelMap === "undefined") {
      // try again shortly
      return setTimeout(init, 250);
    }

    // Adjacent 4-neighbors
    const ADJ = [[1,0],[0,1],[-1,0],[0,-1]];

    // --- Charge helpers ---
    function ensureCharge(p){ if(p && p.charge === undefined) p.charge = 0; }
    function getCharge(p){ return p && p.charge !== undefined ? p.charge : 0; }
    function setCharge(p, val, max=1000){ if(!p) return; p.charge = Math.min(Math.max(0, val), max); }

    // neighbors safe accessor
    function neighborsOf(p){
      let out = [];
      if(!p) return out;
      for(let d of ADJ){
        let col = pixelMap[p.x + d[0]];
        if(col){
          let n = col[p.y + d[1]];
          if(n) out.push(n);
        }
      }
      return out;
    }

    // conservative transfer with tiny-threshold
    function transfer(a,b,rate){
      if(!a || !b) return;
      ensureCharge(a); ensureCharge(b);
      let diff = a.charge - b.charge;
      let t = diff * rate;
      if(Math.abs(t) < 0.02) return; // ignore tiny transfers
      // apply small loss factor to simulate resistance
      let loss = Math.abs(t) * 0.02;
      if(t > 0){
        let outAmount = Math.max(0, t - loss);
        setCharge(a, a.charge - outAmount);
        setCharge(b, b.charge + outAmount);
      } else {
        // negative t -> transfer opposite direction handled by symmetric calls
        let outAmount = Math.max(0, -t - loss);
        setCharge(b, b.charge - outAmount);
        setCharge(a, a.charge + outAmount);
      }
    }

    // push a given amount equally to neighbor receivers
    function pushToNeighbors(p, amount, maxReceiverCapacity=1000){
      if(!p || amount <= 0) return;
      ensureCharge(p);
      let n = neighborsOf(p);
      let receivers = n.filter(x => x && x.element && (
        x.element === "wire" ||
        x.element === "insulated_wire" ||
        x.element === "battery" ||
        x.element === "power_node" ||
        x.element.endsWith("_consumer")
      ));
      if(receivers.length === 0) return;
      let per = amount / receivers.length;
      for(let r of receivers){
        ensureCharge(r);
        setCharge(r, Math.min(maxReceiverCapacity, r.charge + per));
        setCharge(p, Math.max(0, p.charge - per));
      }
    }

    // --- Element definitions ---
    // All elements expose capacity (defaults) and tick uses set/get helpers.

    elements.wire = {
      color: "#9b9b9b",
      behavior: behaviors.WALL,
      category: "energy",
      state: "solid",
      capacity: 120,
      tick: function(pixel){
        ensureCharge(pixel);
        let n = neighborsOf(pixel);
        for(let nb of n){
          if(nb && nb.charge !== undefined){
            transfer(pixel, nb, 0.25);
          }
        }
        if(pixel.charge > this.capacity){
          setCharge(pixel, this.capacity, this.capacity);
          if(Math.random() < 0.0015) createPixel("spark", pixel.x, pixel.y-1);
        }
      },
      desc: "Condutor elétrico padrão. Equilibra carga com vizinhos."
    };

    elements.insulated_wire = {
      color: "#444444",
      behavior: behaviors.WALL,
      category: "energy",
      state: "solid",
      capacity: 200,
      tick: function(pixel){
        ensureCharge(pixel);
        let n = neighborsOf(pixel);
        for(let nb of n){
          if(nb && (nb.element === "insulated_wire" || nb.element === "power_node")){
            transfer(pixel, nb, 0.45);
          }
        }
        if(pixel.charge > this.capacity) setCharge(pixel, this.capacity, this.capacity);
      },
      desc: "Fio isolado: só conecta com outros fios isolados e nós."
    };

    elements.power_node = {
      color: "#6666ff",
      behavior: behaviors.WALL,
      category: "energy",
      state: "solid",
      capacity: 800,
      tick: function(pixel){
        pixel.charge ??= 0;
        let n = neighborsOf(pixel);
        // absorb from neighbors
        for(let nb of n){ if(nb && nb.charge !== undefined) transfer(nb, pixel, 0.12); }
        // push to wires
        for(let nb of n){ if(nb && (nb.element === "wire" || nb.element === "insulated_wire")) transfer(pixel, nb, 0.18); }
        if(pixel.charge > this.capacity) setCharge(pixel, this.capacity, this.capacity);
      },
      desc: "Nodo de distribuição com alta capacidade."
    };

    elements.battery = {
      color: "#2b2bff",
      behavior: behaviors.WALL,
      category: "energy",
      state: "solid",
      capacity: 400,
      tick: function(pixel){
        pixel.charge ??= Math.min(60, pixel.charge || 0);
        let n = neighborsOf(pixel);
        for(let nb of n){
          if(nb && nb.charge !== undefined){
            // neighbor has more -> charge battery
            if(nb.charge > pixel.charge && pixel.charge < this.capacity) transfer(nb, pixel, 0.22);
            // battery powers wires preferentially
            else if(pixel.charge > nb.charge && nb.element === "wire") transfer(pixel, nb, 0.11);
          }
        }
        if(pixel.charge > this.capacity) setCharge(pixel, this.capacity, this.capacity);
      },
      desc: "Bateria que armazena energia para consumo posterior."
    };

    elements.coal_generator = {
      color: "#222222",
      behavior: behaviors.WALL,
      category: "energy",
      state: "solid",
      capacity: 1000,
      tick: function(pixel){
        pixel.charge ??= 0;
        let n = neighborsOf(pixel);
        for(let nb of n){
          if(nb && nb.element === "coal"){
            // consume a single coal neighbor per tick at most
            deletePixel(nb.x, nb.y);
            setCharge(pixel, Math.min(this.capacity, pixel.charge + 120), this.capacity);
            break;
          }
        }
        pushToNeighbors(pixel, 8, this.capacity);
        if(pixel.charge > 900){
          if(Math.random() < 0.01) createPixel("smoke", pixel.x, pixel.y-1);
          setCharge(pixel, 900, this.capacity);
        }
      },
      desc: "Gerador que consome carvão ao redor para produzir energia."
    };

    elements.steam_generator = {
      color: "#2f6f6f",
      behavior: behaviors.WALL,
      category: "energy",
      state: "solid",
      capacity: 700,
      tick: function(pixel){
        pixel.charge ??= 0;
        let n = neighborsOf(pixel);
        for(let nb of n){
          if(nb && nb.element === "water"){
            if(Math.random() < 0.02){
              deletePixel(nb.x, nb.y);
              setCharge(pixel, Math.min(this.capacity, pixel.charge + 50), this.capacity);
              createPixel("steam", pixel.x, pixel.y-1);
            }
          }
        }
        pushToNeighbors(pixel, 3, this.capacity);
      },
      desc: "Gera energia consumindo água e emitindo vapor."
    };

    elements.solar_panel = {
      color: "#19a119",
      behavior: behaviors.WALL,
      category: "energy",
      state: "solid",
      capacity: 300,
      tick: function(pixel){
        pixel.charge ??= 0;
        // use local system hour; if you want in-game day/night integration, a separate hook is needed
        try{
          let hour = (new Date()).getHours();
          if(hour >= 7 && hour <= 18){
            setCharge(pixel, Math.min(this.capacity, pixel.charge + 0.9), this.capacity);
            if(Math.random() < 0.008) createPixel("spark", pixel.x, pixel.y - 1);
          }
        }catch(e){}
        pushToNeighbors(pixel, 1.2, this.capacity);
      },
      desc: "Painel solar: gera durante o dia (usa hora real do sistema)."
    };

    elements.electric_motor = {
      color: "#ff8a00",
      behavior: behaviors.WALL,
      category: "energy",
      state: "solid",
      capacity: 250,
      efficiency: 0.75,
      tick: function(pixel){
        pixel.charge ??= 0;
        if(pixel.charge > 5){
          // consume energy to apply effect
          setCharge(pixel, pixel.charge - 5, this.capacity);
          if(Math.random() < 0.12) createPixel("smoke", pixel.x, pixel.y - 1);
          // pick left or right, but avoid deleting wires or nodes
          let dir = Math.random() < 0.5 ? 1 : -1;
          let tx = pixel.x + dir;
          let ty = pixel.y;
          let col = pixelMap[tx]?.[ty];
          if(col && col.element && col.element !== "wire" && col.element !== "insulated_wire" && col.element !== "power_node"){
            let el = col.element;
            // move element with checks: avoid overwriting motor itself
            deletePixel(tx, ty);
            // attempt to move it one or two steps with some randomness, but only into air or non-solid behavior
            let targetX = pixel.x + (Math.random() < 0.5 ? 0 : dir*2);
            let targetY = pixel.y;
            // only create if spot is empty or safe to replace
            let spot = pixelMap[targetX]?.[targetY];
            if(!spot || spot.element === "air") createPixel(el, targetX, targetY);
            else if(!pixelMap[pixel.x]?.[pixel.y]) createPixel(el, pixel.x, pixel.y);
          }
        } else if(pixel.charge > 0 && Math.random() < 0.02){
          createPixel("spark", pixel.x, pixel.y-1);
        }
      },
      desc: "Motor elétrico: consome energia e aplica pequena força mecânica a pixels vizinhos."
    };

    elements.electric_lamp_consumer = {
      color: "#ffd966",
      behavior: behaviors.WALL,
      category: "energy",
      state: "solid",
      capacity: 50,
      tick: function(pixel){
        pixel.charge ??= 0;
        if(pixel.charge > 2){
          setCharge(pixel, pixel.charge - 1, this.capacity);
          if(Math.random() < 0.08) createPixel("spark", pixel.x, pixel.y-1);
          if(Math.random() < 0.05) createPixel("light_particle", pixel.x, pixel.y-1);
        }
      },
      desc: "Lâmpada elétrica: consome energia e gera partículas de luz."
    };

    elements.electric_heater_consumer = {
      color: "#ff4444",
      behavior: behaviors.WALL,
      category: "energy",
      state: "solid",
      capacity: 60,
      tick: function(pixel){
        pixel.charge ??= 0;
        if(pixel.charge > 3){
          setCharge(pixel, pixel.charge - 2, this.capacity);
          let above = pixelMap[pixel.x]?.[pixel.y-1];
          if(!above || above.element === "air") createPixel("fire", pixel.x, pixel.y-1);
        }
      },
      desc: "Aquecedor elétrico: consome energia e produz fogo acima."
    };

    elements.relay_switch = {
      color: "#aaaa22",
      behavior: behaviors.WALL,
      category: "energy",
      state: "solid",
      capacity: 300,
      tick: function(pixel){
        pixel.on ??= false;
        pixel.charge ??= 0;
        let n = neighborsOf(pixel);
        let powered = n.some(x => x && x.charge !== undefined && x.charge > 20);
        if(powered && !pixel.on){
          pixel.on = true;
          setCharge(pixel, Math.min(this.capacity, pixel.charge + 40), this.capacity);
        }
        if(!powered && pixel.on) pixel.on = false; // fixed assignment bug
        if(pixel.on){
          for(let nb of n){
            if(nb && nb.element && nb.element.endsWith("_consumer")){
              transfer(pixel, nb, 0.2);
            }
          }
        }
      },
      desc: "Relé/switch: ativa consumidores próximos quando recebe energia."
    };

    console.log("[advancedElectricityMod] loaded: elements added/overwritten.");
  } // end init

  // start init loop
  init();

})();
                      
