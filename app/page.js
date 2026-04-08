'use client';
import { useState, useEffect, Suspense } from 'react';
import { supabase } from '../lib/supabase';
import { PALABRAS_PICTUREKA } from '../data';
import { useSearchParams } from 'next/navigation';

export default function PicturekaEclases() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center font-bold text-[#152239]">Loading E-clases...</div>}>
      <GameContent />
    </Suspense>
  );
}

function GameContent() {
  const searchParams = useSearchParams();
  const soyElJugador = searchParams.get('jugador'); 
  const roomParam = searchParams.get('room'); 
  
  const [game, setGame] = useState(null);
  const [activeMoles, setActiveMoles] = useState([]); 
  const [inputRoom, setInputRoom] = useState('');
  
  const [nombreA, setNombreA] = useState('Teacher');
  const [nombreB, setNombreB] = useState('Student');
  const [maxRondas, setMaxRondas] = useState(3);

  // 1. CONEXIÓN Y REALTIME
  useEffect(() => {
    if (!roomParam) return;
    const cargarYEscuchar = async () => {
      const { data } = await supabase.from('sesiones_juego').select('*').eq('room_id', roomParam).single();
      if (data) setGame(data);

      const channel = supabase.channel(`room-${roomParam}`)
        .on('postgres_changes', { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'sesiones_juego',
            filter: `room_id=eq.${roomParam}` 
        }, (payload) => setGame(payload.new))
        .subscribe();
      return () => supabase.removeChannel(channel);
    };
    cargarYEscuchar();
  }, [roomParam]);

  // 2. LÓGICA DE TOPOS
  useEffect(() => {
    if (!game || game.cronometro <= 0 || game.status !== 'PLAYING') {
      setActiveMoles([]);
      return;
    }
    const refrescarTopos = () => {
      const opcionesCorrectas = PALABRAS_PICTUREKA.filter(item => item.nombre === game.objetivo_actual);
      const correctos = Array.from({ length: 3 }, () => opcionesCorrectas[Math.floor(Math.random() * opcionesCorrectas.length)]);
      const relleno = Array.from({ length: 3 }, () => PALABRAS_PICTUREKA[Math.floor(Math.random() * PALABRAS_PICTUREKA.length)]);
      const combinados = [...correctos, ...relleno];
      const pos = [...Array(12).keys()].sort(() => Math.random() - 0.5);
      setActiveMoles(combinados.map((item, idx) => ({ ...item, posicion: pos[idx] })));
    };
    refrescarTopos();
    const interval = setInterval(refrescarTopos, 2000);
    return () => clearInterval(interval);
  }, [game?.objetivo_actual, game?.status]);

  // 3. CRONÓMETRO CORREGIDO (Solo corre para el Jugador A)
  // 3. CRONÓMETRO INDESTRUCTIBLE
  useEffect(() => {
    let timer;
    if (game?.status === 'PLAYING' && soyElJugador === 'A') {
      if (game.cronometro > 0) {
        timer = setTimeout(() => {
          // Usamos la sala actual para bajar el tiempo
          supabase
            .from('sesiones_juego')
            .update({ cronometro: game.cronometro - 1 })
            .eq('room_id', roomParam)
            .then(({ error }) => {
               if(error) console.error("Error cronómetro:", error);
            });
        }, 1000);
      } else {
        manejarCambioRonda();
      }
    }
    return () => clearTimeout(timer);
  }, [game?.cronometro, game?.status, soyElJugador, roomParam]); // Agregamos todas las dependencias

  const crearSala = async () => {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const word = PALABRAS_PICTUREKA[Math.floor(Math.random() * PALABRAS_PICTUREKA.length)].nombre;
    await supabase.from('sesiones_juego').insert([{
      room_id: code,
      status: 'LOBBY',
      nombre_a: nombreA,
      nombre_b: nombreB,
      max_rondas: parseInt(maxRondas),
      objetivo_actual: word,
      cronometro: 15,
      turno_de: 'jugador_a'
    }]);
    window.location.search = `?room=${code}&jugador=A`;
  };

  const unirseASala = async () => {
    if (!inputRoom) return;
    // Actualizamos el nombre del estudiante en la DB antes de entrar
    await supabase.from('sesiones_juego').update({ nombre_b: nombreB }).eq('room_id', inputRoom);
    window.location.search = `?room=${inputRoom}&jugador=B`;
  };

  const iniciarJuego = async () => {
    // 1. Elegimos una palabra al azar para empezar
    const randomWord = PALABRAS_PICTUREKA[Math.floor(Math.random() * PALABRAS_PICTUREKA.length)].nombre;

    // 2. Intentamos actualizar el estado en Supabase
    const { error } = await supabase
      .from('sesiones_juego')
      .update({ 
        status: 'PLAYING', 
        objetivo_actual: randomWord,
        cronometro: 15,
        puntos_a: 0,
        puntos_b: 0,
        ronda_actual: 1,
        turno_de: 'jugador_a'
      })
      .eq('room_id', roomParam);

    if (error) {
      alert("Error al iniciar: " + error.message);
    }
  };

  const manejarGolpe = async (mote) => {
    const miTurno = (soyElJugador === 'A' && game.turno_de === 'jugador_b') || (soyElJugador === 'B' && game.turno_de === 'jugador_a');
    if (miTurno && mote.nombre === game.objetivo_actual && game.status === 'PLAYING') {
      const pts = soyElJugador === 'A' ? 'puntos_a' : 'puntos_b';
      await supabase.from('sesiones_juego').update({ [pts]: game[pts] + 10 }).eq('room_id', roomParam);
    }
  };

  const manejarCambioRonda = async () => {
    if (game.ronda_actual >= game.max_rondas) {
      await supabase.from('sesiones_juego').update({ status: 'FINISHED' }).eq('room_id', roomParam);
    } else {
      const sig = game.turno_de === 'jugador_a' ? 'jugador_b' : 'jugador_a';
      const word = PALABRAS_PICTUREKA[Math.floor(Math.random() * PALABRAS_PICTUREKA.length)].nombre;
      await supabase.from('sesiones_juego').update({ 
        turno_de: sig, cronometro: 15, objetivo_actual: word, ronda_actual: game.ronda_actual + 1 
      }).eq('room_id', roomParam);
    }
  };

  if (!roomParam) {
    return (
      <div className="min-h-screen bg-[#152239] flex flex-col items-center justify-center p-4 text-white">
        <h1 className="text-5xl font-black text-[#abca25] mb-8 uppercase tracking-tighter">E-CLASES</h1>
        <div className="grid md:grid-cols-2 gap-6 w-full max-w-3xl text-slate-800 font-sans">
          <div className="bg-white p-8 rounded-[2rem] shadow-2xl flex flex-col justify-between">
            <div>
              <h3 className="font-black text-[#2db8bc] mb-4 uppercase text-sm">Teacher Panel</h3>
              <input placeholder="Your Name" value={nombreA} onChange={e => setNombreA(e.target.value)} className="w-full p-3 mb-3 bg-slate-100 rounded-xl" />
              <div className="mb-4">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Rounds</label>
                <input type="number" value={maxRondas} onChange={e => setMaxRondas(e.target.value)} className="w-full p-3 bg-slate-100 rounded-xl" />
              </div>
            </div>
            <button onClick={crearSala} className="w-full bg-[#2db8bc] text-white p-4 rounded-xl font-black shadow-lg hover:scale-105 transition-all">CREATE ROOM</button>
          </div>
          <div className="bg-white p-8 rounded-[2rem] shadow-2xl flex flex-col justify-between border-t-8 md:border-t-0 md:border-l-8 border-[#abca25]">
            <div>
              <h3 className="font-black text-[#abca25] mb-4 uppercase text-sm">Student Panel</h3>
              <input placeholder="Student Name" value={nombreB} onChange={e => setNombreB(e.target.value)} className="w-full p-3 mb-3 bg-slate-100 rounded-xl" />
              <input placeholder="4-Digit Code" value={inputRoom} onChange={e => setInputRoom(e.target.value)} className="w-full p-3 mb-4 bg-slate-100 rounded-xl ring-2 ring-[#abca25]/20" />
            </div>
            <button onClick={unirseASala} className="w-full bg-[#abca25] text-[#152239] p-4 rounded-xl font-black shadow-lg hover:scale-105 transition-all">JOIN CLASS</button>
          </div>
        </div>
      </div>
    );
  }

  if (game?.status === 'LOBBY') {
    return (
      <div className="min-h-screen bg-[#2db8bc] flex flex-col items-center justify-center text-white p-6 text-center">
        <span className="text-[#152239] font-black uppercase text-sm mb-2">{soyElJugador === 'A' ? "SHARE THIS CODE:" : "WAITING FOR TEACHER..."}</span>
        <div className="text-8xl font-black bg-[#152239] px-10 py-6 rounded-[3rem] mb-8 shadow-2xl">{roomParam}</div>
        {soyElJugador === 'A' && <button onClick={iniciarJuego} className="bg-[#abca25] text-[#152239] px-12 py-5 rounded-full font-black text-2xl shadow-xl hover:scale-105 transition-all">START GAME</button>}
      </div>
    );
  }

  if (game?.status === 'FINISHED') {
    const ganador = game.puntos_a > game.puntos_b ? game.nombre_a : game.nombre_b;
    return (
      <div className="min-h-screen bg-[#f9b800] flex flex-col items-center justify-center p-6 text-[#152239] text-center">
        <h1 className="text-6xl font-black mb-4 uppercase">Lesson Over!</h1>
        <h2 className="text-3xl font-black mb-10 bg-[#152239] text-white px-8 py-2 rounded-full">{ganador} wins!</h2>
        <button onClick={() => window.location.search = ''} className="bg-[#152239] text-white px-10 py-4 rounded-2xl font-black">EXIT</button>
      </div>
    );
  }

  const esMiTurnoDeHablar = (soyElJugador === 'A' && game?.turno_de === 'jugador_a') || (soyElJugador === 'B' && game?.turno_de === 'jugador_b');

  return (
    <main className="h-screen bg-[#f4f7f8] p-2 flex flex-col items-center justify-between font-sans text-[#152239] overflow-hidden">
      <div className="w-full max-w-xl flex justify-between items-center bg-white p-3 rounded-[2rem] shadow-lg border-t-4 border-[#2db8bc] mt-2">
        <div className={`text-center ${game?.turno_de === 'jugador_b' ? "scale-105" : "opacity-30"}`}>
          <p className="text-[9px] font-black text-[#2db8bc] uppercase">{game?.nombre_a}</p>
          <p className="text-2xl font-black">{game?.puntos_a}</p>
        </div>
        <div className="flex flex-col items-center">
            <div className="bg-[#152239] text-[#f9b800] w-14 h-14 rounded-full flex items-center justify-center shadow-lg text-2xl font-black mb-1 ring-4 ring-[#2db8bc]/10">{game?.cronometro}</div>
            <span className="bg-[#abca25] text-[#152239] px-3 py-0.5 rounded-full text-[8px] font-black uppercase">Rd {game?.ronda_actual} / {game?.max_rondas}</span>
        </div>
        <div className={`text-center ${game?.turno_de === 'jugador_a' ? "scale-105" : "opacity-30"}`}>
          <p className="text-[9px] font-black text-[#2db8bc] uppercase">{game?.nombre_b}</p>
          <p className="text-2xl font-black">{game?.puntos_b}</p>
        </div>
      </div>

      <div className="w-full max-w-2xl flex flex-col items-center flex-grow justify-center">
        <div className="w-full bg-white p-5 rounded-[2.5rem] shadow-xl text-center mb-6 border-b-[8px] border-[#abca25]">
          {esMiTurnoDeHablar ? (
            <h1 className="text-5xl md:text-7xl font-black text-[#152239] uppercase truncate">{game?.objetivo_actual}</h1>
          ) : (
            <h2 className="text-3xl md:text-5xl font-black text-[#2db8bc] uppercase">Find the object!</h2>
          )}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 w-full px-4 max-h-[55vh]">
          {[...Array(12)].map((_, index) => {
            const topoAqui = activeMoles.find(m => m.posicion === index);
            return (
              <div key={index} className="aspect-square bg-white/60 rounded-[1.5rem] relative shadow-inner border border-slate-200 flex items-center justify-center">
                {topoAqui && (
                  <button onClick={() => manejarGolpe(topoAqui)} className={`text-5xl md:text-7xl animate-pop ${esMiTurnoDeHablar ? 'opacity-0 pointer-events-none' : 'opacity-100 active:scale-50'}`}>
                    {topoAqui.emoji}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}