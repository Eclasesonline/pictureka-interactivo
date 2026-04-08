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
  const soyElJugador = searchParams.get('jugador'); // 'A' o 'B'
  const roomParam = searchParams.get('room'); // Código de la sala
  
  const [game, setGame] = useState(null);
  const [activeMoles, setActiveMoles] = useState([]); 
  const [inputRoom, setInputRoom] = useState('');
  
  // Lobby States
  const [nombreA, setNombreA] = useState('Teacher');
  const [nombreB, setNombreB] = useState('Student');
  const [maxRondas, setMaxRondas] = useState(3);

  // 1. CONEXIÓN A SALA ESPECÍFICA Y REALTIME
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

  // 2. LÓGICA DE TOPOS (Asegura que aparezcan los correctos)
  useEffect(() => {
    if (!game || game.cronometro <= 0 || game.status !== 'PLAYING') {
      setActiveMoles([]);
      return;
    }

    const refrescarTopos = () => {
      const opcionesCorrectas = PALABRAS_PICTUREKA.filter(item => item.nombre === game.objetivo_actual);
      
      // Garantizamos 3 correctos y 3 aleatorios para que siempre haya qué clickear
      const correctos = Array.from({ length: 3 }, () => 
        opcionesCorrectas[Math.floor(Math.random() * opcionesCorrectas.length)]
      );
      const relleno = Array.from({ length: 3 }, () => 
        PALABRAS_PICTUREKA[Math.floor(Math.random() * PALABRAS_PICTUREKA.length)]
      );

      const combinados = [...correctos, ...relleno];
      const pos = [...Array(12).keys()].sort(() => Math.random() - 0.5);

      setActiveMoles(combinados.map((item, idx) => ({ ...item, posicion: pos[idx] })));
    };

    refrescarTopos();
    const interval = setInterval(refrescarTopos, 2000);
    return () => clearInterval(interval);
  }, [game?.id, game?.objetivo_actual, game?.status]);

  // 3. CONTROL DEL CRONÓMETRO (Sincronizado por Jugador A)
  useEffect(() => {
    if (!game || game.status !== 'PLAYING' || soyElJugador !== 'A') return;

    if (game.cronometro > 0) {
      const timer = setTimeout(() => {
        supabase.from('sesiones_juego').update({ cronometro: game.cronometro - 1 }).eq('room_id', roomParam);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      manejarCambioRonda();
    }
  }, [game?.cronometro, game?.status]);

  // 4. FUNCIONES DE NAVEGACIÓN Y ESTADO
  const crearSala = async () => {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const word = PALABRAS_PICTUREKA[Math.floor(Math.random() * PALABRAS_PICTUREKA.length)].nombre;
    await supabase.from('sesiones_juego').insert([{
      room_id: code,
      status: 'LOBBY',
      nombre_a: nombreA,
      nombre_b: nombreB,
      max_rondas: maxRondas,
      objetivo_actual: word,
      cronometro: 15
    }]);
    window.location.href = `?room=${code}&jugador=A`;
  };

  const unirseASala = () => {
    if (inputRoom) window.location.href = `?room=${inputRoom}&jugador=B`;
  };

  const iniciarJuego = () => supabase.from('sesiones_juego').update({ status: 'PLAYING' }).eq('room_id', roomParam);

  const resetGame = () => supabase.from('sesiones_juego').update({ 
    status: 'LOBBY', puntos_a: 0, puntos_b: 0, ronda_actual: 1, cronometro: 15 
  }).eq('room_id', roomParam);

  const manejarGolpe = async (mote) => {
    const miTurno = (soyElJugador === 'A' && game.turno_de === 'jugador_b') || (soyElJugador === 'B' && game.turno_de === 'jugador_a');
    if (miTurno && mote.nombre === game.objetivo_actual && game.status === 'PLAYING') {
      const pts = soyElJugador === 'A' ? 'puntos_a' : 'puntos_b';
      await supabase.from('sesiones_juego').update({ [pts]: game[pts] + 10 }).eq('room_id', roomParam);
      setActiveMoles(prev => prev.filter(m => m.posicion !== mote.posicion));
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

  // --- VISTAS ---

  // LOBBY DE ENTRADA (Sin sala aún)
  if (!roomParam) {
    return (
      <div className="min-h-screen bg-[#152239] flex flex-col items-center justify-center p-4 text-white font-sans">
        <h1 className="text-5xl font-black text-[#abca25] mb-8">E-CLASES</h1>
        <div className="grid md:grid-cols-2 gap-6 w-full max-w-2xl text-slate-800">
          <div className="bg-white p-8 rounded-[2rem] shadow-2xl">
            <h3 className="font-bold text-[#2db8bc] mb-4 uppercase text-sm">Create New Lesson</h3>
            <input placeholder="Your Name" value={nombreA} onChange={e => setNombreA(e.target.value)} className="w-full p-3 mb-4 bg-slate-100 rounded-xl outline-none focus:ring-2 ring-[#2db8bc]" />
            <button onClick={crearSala} className="w-full bg-[#2db8bc] text-white p-4 rounded-xl font-black shadow-lg hover:bg-[#24a1a5] transition-all">CREATE ROOM</button>
          </div>
          <div className="bg-white p-8 rounded-[2rem] shadow-2xl">
            <h3 className="font-bold text-[#abca25] mb-4 uppercase text-sm">Join a Lesson</h3>
            <input placeholder="4-digit code" value={inputRoom} onChange={e => setInputRoom(e.target.value)} className="w-full p-3 mb-4 bg-slate-100 rounded-xl outline-none focus:ring-2 ring-[#abca25]" />
            <button onClick={unirseASala} className="w-full bg-[#abca25] text-[#152239] p-4 rounded-xl font-black shadow-lg hover:bg-[#b5d122] transition-all">JOIN GAME</button>
          </div>
        </div>
      </div>
    );
  }

  // PANTALLA DE ESPERA (Con código de sala)
  if (game?.status === 'LOBBY') {
    return (
      <div className="min-h-screen bg-[#2db8bc] flex flex-col items-center justify-center text-white p-6 text-center">
        <span className="text-[#152239] font-black uppercase tracking-widest text-sm mb-2">Share this code:</span>
        <div className="text-8xl font-black bg-[#152239] px-10 py-6 rounded-[3rem] mb-8 shadow-2xl shadow-black/30">{roomParam}</div>
        {soyElJugador === 'A' ? (
          <button onClick={iniciarPartida} className="bg-[#abca25] text-[#152239] px-12 py-5 rounded-full font-black text-2xl shadow-xl hover:scale-105 transition-transform">START GAME</button>
        ) : (
          <p className="animate-pulse font-bold text-xl">Waiting for teacher to start...</p>
        )}
      </div>
    );
  }

  // PANTALLA DE GANADOR
  if (game?.status === 'FINISHED') {
    const ganador = game.puntos_a > game.puntos_b ? (game.nombre_a || 'A') : (game.nombre_b || 'B');
    const empate = game.puntos_a === game.puntos_b;
    return (
      <div className="min-h-screen bg-[#f9b800] flex flex-col items-center justify-center p-6 text-[#152239] text-center">
        <div className="text-8xl mb-4">🏆</div>
        <h1 className="text-5xl md:text-7xl font-black mb-4 leading-tight">{empate ? "IT'S A DRAW!" : "YOU ARE THE WINNER!"}</h1>
        {!empate && <h2 className="text-3xl font-black mb-10 bg-[#152239] text-white px-10 py-3 rounded-full">{ganador}</h2>}
        <button onClick={resetGame} className="bg-[#152239] text-white px-12 py-5 rounded-[2rem] font-black text-xl shadow-xl hover:bg-[#2db8bc] transition-all">PLAY AGAIN</button>
      </div>
    );
  }

  // PANTALLA DE JUEGO
  const esMiTurnoDeHablar = (soyElJugador === 'A' && game?.turno_de === 'jugador_a') || (soyElJugador === 'B' && game?.turno_de === 'jugador_b');

  return (
    <main className="h-screen bg-[#f4f7f8] p-2 md:p-4 flex flex-col items-center justify-between font-sans text-[#152239] overflow-hidden">
      {/* Marcador */}
      <div className="w-full max-w-xl flex justify-between items-center bg-white p-3 rounded-[2rem] shadow-lg border-t-4 border-[#2db8bc] mt-2">
        <div className={`text-center transition-all ${game?.turno_de === 'jugador_b' ? "scale-105" : "opacity-30 grayscale"}`}>
          <p className="text-[9px] font-black text-[#2db8bc] uppercase">{game?.nombre_a}</p>
          <p className="text-2xl font-black">{game?.puntos_a}</p>
        </div>
        <div className="flex flex-col items-center">
            <div className="bg-[#152239] text-[#f9b800] w-14 h-14 rounded-full flex items-center justify-center shadow-lg text-2xl font-black mb-1 ring-4 ring-[#2db8bc]/10">
                {game?.cronometro}
            </div>
            <span className="bg-[#abca25] text-[#152239] px-3 py-0.5 rounded-full text-[8px] font-black uppercase">Room: {roomParam} | Rd {game?.ronda_actual}</span>
        </div>
        <div className={`text-center transition-all ${game?.turno_de === 'jugador_a' ? "scale-105" : "opacity-30 grayscale"}`}>
          <p className="text-[9px] font-black text-[#2db8bc] uppercase">{game?.nombre_b}</p>
          <p className="text-2xl font-black">{game?.puntos_b}</p>
        </div>
      </div>

      {/* Área Central */}
      <div className="w-full max-w-2xl flex flex-col items-center flex-grow justify-center">
        <div className="w-full bg-white p-5 rounded-[2.5rem] shadow-xl text-center mb-6 border-b-[8px] border-[#abca25]">
          {esMiTurnoDeHablar ? (
            <>
              <span className="text-[#2db8bc] font-black uppercase text-[10px]">Speaker Mode: Pronounce!</span>
              <h1 className="text-5xl md:text-7xl font-black text-[#152239] leading-tight uppercase truncate">{game?.objetivo_actual}</h1>
            </>
          ) : (
            <>
              <span className="text-slate-400 font-bold uppercase text-[10px]">Listen to your teacher...</span>
              <h2 className="text-3xl md:text-5xl font-black text-[#2db8bc] uppercase">Find the object!</h2>
            </>
          )}
        </div>

        {/* Tablero */}
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

      <style jsx>{`
        @keyframes pop {
          0% { transform: scale(0); opacity: 0; }
          70% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-pop { animation: pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
      `}</style>
    </main>
  );
}