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
  const [game, setGame] = useState(null);
  const [activeMoles, setActiveMoles] = useState([]); 
  
  const [nombreA, setNombreA] = useState('Player A');
  const [nombreB, setNombreB] = useState('Player B');
  const [maxRondas, setMaxRondas] = useState(3);

  useEffect(() => {
    const cargarJuego = async () => {
      const { data } = await supabase.from('sesiones_juego').select('*').limit(1).single();
      if (data) setGame(data);
    };
    cargarJuego();
    const channel = supabase.channel('game_channel')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sesiones_juego' }, 
      (payload) => setGame(payload.new)).subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  useEffect(() => {
    if (!game || game.cronometro <= 0 || game.status !== 'PLAYING') {
      setActiveMoles([]);
      return;
    }

    const refrescarTopos = () => {
      // 1. Filtramos todos los emojis que coinciden con la palabra actual
      const opcionesCorrectas = PALABRAS_PICTUREKA.filter(item => item.nombre === game.objetivo_actual);
      
      // 2. Elegimos 2 emojis correctos garantizados
      const correctos = Array.from({ length: 2 }, () => 
        opcionesCorrectas[Math.floor(Math.random() * opcionesCorrectas.length)]
      );

      // 3. Elegimos 4 emojis de relleno (incorrectos)
      const relleno = Array.from({ length: 4 }, () => 
        PALABRAS_PICTUREKA[Math.floor(Math.random() * PALABRAS_PICTUREKA.length)]
      );

      // 4. Combinamos y asignamos posiciones aleatorias (sin repetir hueco)
      const combinados = [...correctos, ...relleno];
      const posicionesDisponibles = [...Array(12).keys()].sort(() => Math.random() - 0.5);

      const nuevosTopos = combinados.map((item, idx) => ({
        ...item,
        posicion: posicionesDisponibles[idx]
      }));

      setActiveMoles(nuevosTopos);
    };

    refrescarTopos();
    const interval = setInterval(refrescarTopos, 2500);
    return () => clearInterval(interval);
  }, [game?.id, game?.objetivo_actual, game?.status]);

  useEffect(() => {
    if (!game || game.status !== 'PLAYING') return;
    if (game.cronometro > 0) {
      const timer = setTimeout(async () => {
        if (soyElJugador === 'A') {
          await supabase.from('sesiones_juego').update({ cronometro: game.cronometro - 1 }).eq('id', game.id);
        }
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      manejarCambioRonda();
    }
  }, [game?.cronometro, game?.status]);

  const iniciarJuego = async () => {
    const initialWord = PALABRAS_PICTUREKA[Math.floor(Math.random() * PALABRAS_PICTUREKA.length)].nombre;
    await supabase.from('sesiones_juego').update({
      status: 'PLAYING', cronometro: 15, puntos_a: 0, puntos_b: 0, ronda_actual: 1,
      max_rondas: parseInt(maxRondas), nombre_a: nombreA, nombre_b: nombreB,
      objetivo_actual: initialWord, turno_de: 'jugador_a'
    }).eq('id', game.id);
  };

  const resetGame = async () => {
    await supabase.from('sesiones_juego').update({ status: 'LOBBY', puntos_a: 0, puntos_b: 0, ronda_actual: 1, cronometro: 15 }).eq('id', game.id);
  };

  const manejarCambioRonda = async () => {
    if (soyElJugador !== 'A') return;
    if (game.ronda_actual >= game.max_rondas) {
      await supabase.from('sesiones_juego').update({ status: 'FINISHED' }).eq('id', game.id);
    } else {
      const siguiente = game.turno_de === 'jugador_a' ? 'jugador_b' : 'jugador_a';
      const nuevaPalabra = PALABRAS_PICTUREKA[Math.floor(Math.random() * PALABRAS_PICTUREKA.length)].nombre;
      await supabase.from('sesiones_juego').update({
        turno_de: siguiente, cronometro: 15, objetivo_actual: nuevaPalabra, ronda_actual: game.ronda_actual + 1
      }).eq('id', game.id);
    }
  };

  const manejarGolpe = async (mote) => {
    const miTurnoDeBuscar = (soyElJugador === 'A' && game.turno_de === 'jugador_b') || (soyElJugador === 'B' && game.turno_de === 'jugador_a');
    if (miTurnoDeBuscar && mote.nombre === game.objetivo_actual && game.status === 'PLAYING') {
      const campoPuntos = soyElJugador === 'A' ? 'puntos_a' : 'puntos_b';
      await supabase.from('sesiones_juego').update({ [campoPuntos]: game[campoPuntos] + 10 }).eq('id', game.id);
      setActiveMoles(prev => prev.filter(m => m.posicion !== mote.posicion));
    }
  };

  if (!game) return <div className="flex h-screen items-center justify-center font-bold text-[#152239]">Connecting...</div>;

  if (!game.status || game.status === 'LOBBY') {
    return (
      <div className="min-h-screen bg-[#152239] flex flex-col items-center justify-center p-4 text-white font-sans">
        <div className="mb-6 text-center">
            <h1 className="text-4xl md:text-6xl font-black text-[#abca25]">E-CLASES</h1>
            <h2 className="text-xl font-bold text-[#2db8bc]">Pictureka Setup</h2>
        </div>
        <div className="bg-white p-6 rounded-[2rem] text-slate-800 w-full max-w-sm shadow-2xl">
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Teacher / Player A</label>
              <input value={nombreA} onChange={(e) => setNombreA(e.target.value)} className="w-full p-3 bg-slate-100 rounded-xl outline-none ring-[#2db8bc]/30 focus:ring-4 transition-all" />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Student / Player B</label>
              <input value={nombreB} onChange={(e) => setNombreB(e.target.value)} className="w-full p-3 bg-slate-100 rounded-xl outline-none ring-[#2db8bc]/30 focus:ring-4 transition-all" />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Total Rounds</label>
              <input type="number" value={maxRondas} onChange={(e) => setMaxRondas(e.target.value)} className="w-full p-3 bg-slate-100 rounded-xl" />
            </div>
            <button onClick={iniciarJuego} className="w-full bg-[#abca25] text-[#152239] p-4 rounded-2xl font-black text-xl hover:bg-[#b8d92b] transition-all shadow-lg active:scale-95">START LESSON</button>
          </div>
        </div>
      </div>
    );
  }

  if (game.status === 'FINISHED') {
    const ganador = game.puntos_a > game.puntos_b ? (game.nombre_a || 'Player A') : (game.nombre_b || 'Player B');
    const empate = game.puntos_a === game.puntos_b;
    return (
      <div className="min-h-screen bg-[#f9b800] flex flex-col items-center justify-center p-6 text-[#152239] text-center">
        <div className="text-7xl mb-4 drop-shadow-lg">🎉</div>
        <h1 className="text-4xl md:text-6xl font-black mb-4 leading-tight">{empate ? "IT'S A DRAW!" : "YOU ARE THE WINNER!"}</h1>
        {!empate && <h2 className="text-3xl font-black mb-8 bg-[#152239] text-white px-8 py-2 rounded-full shadow-xl">{ganador}</h2>}
        <button onClick={resetGame} className="bg-[#152239] text-white px-10 py-4 rounded-2xl font-black text-xl shadow-xl hover:scale-105 transition-all">PLAY AGAIN</button>
      </div>
    );
  }

  const esMiTurnoDeHablar = (soyElJugador === 'A' && game.turno_de === 'jugador_a') || (soyElJugador === 'B' && game.turno_de === 'jugador_b');

  return (
    <main className="h-screen bg-[#f4f7f8] p-2 md:p-4 flex flex-col items-center justify-between font-sans text-[#152239] overflow-hidden">
      {/* Marcador Adaptativo */}
      <div className="w-full max-w-xl flex justify-between items-center bg-white p-3 md:p-4 rounded-[2rem] shadow-lg border-t-4 border-[#2db8bc] mt-2">
        <div className={`text-center transition-all ${game.turno_de === 'jugador_b' ? "scale-105" : "opacity-30 grayscale"}`}>
          <p className="text-[9px] font-black text-[#2db8bc] uppercase">{game.nombre_a}</p>
          <p className="text-2xl md:text-3xl font-black">{game.puntos_a}</p>
        </div>
        <div className="flex flex-col items-center">
            <div className="bg-[#152239] text-[#f9b800] w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center shadow-lg text-xl md:text-2xl font-black mb-1 ring-4 ring-[#2db8bc]/10">
                {game.cronometro}
            </div>
            <span className="bg-[#abca25] text-[#152239] px-3 py-0.5 rounded-full text-[8px] font-black uppercase">Rd {game.ronda_actual} / {game.max_rondas}</span>
        </div>
        <div className={`text-center transition-all ${game.turno_de === 'jugador_a' ? "scale-105" : "opacity-30 grayscale"}`}>
          <p className="text-[9px] font-black text-[#2db8bc] uppercase">{game.nombre_b}</p>
          <p className="text-2xl md:text-3xl font-black">{game.puntos_b}</p>
        </div>
      </div>

      {/* Área Central (Ajustada para no ocupar todo) */}
      <div className="w-full max-w-2xl flex flex-col items-center flex-grow justify-center">
        <div className="w-full bg-white p-4 md:p-6 rounded-[2.5rem] shadow-xl text-center mb-4 md:mb-6 border-b-[8px] border-[#abca25]">
          {esMiTurnoDeHablar ? (
            <>
              <span className="text-[#2db8bc] font-black uppercase text-[10px]">Speaker Mode</span>
              <h1 className="text-4xl md:text-6xl font-black text-[#152239] leading-tight uppercase truncate">{game.objetivo_actual}</h1>
            </>
          ) : (
            <>
              <span className="text-slate-400 font-bold uppercase text-[10px]">Listen closely...</span>
              <h2 className="text-2xl md:text-4xl font-black text-[#2db8bc] uppercase">Find the object!</h2>
            </>
          )}
        </div>

        {/* Tablero (Tamaño de iconos adaptativo) */}
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 md:gap-4 w-full px-4 max-h-[50vh]">
          {[...Array(12)].map((_, index) => {
            const topoAqui = activeMoles.find(m => m.posicion === index);
            return (
              <div key={index} className="aspect-square bg-white/60 rounded-[1.5rem] md:rounded-[2rem] relative shadow-inner border border-slate-200 flex items-center justify-center">
                {topoAqui && (
                  <button 
                    onClick={() => manejarGolpe(topoAqui)} 
                    className={`text-4xl md:text-6xl animate-pop transition-all
                      ${esMiTurnoDeHablar ? 'opacity-0 pointer-events-none' : 'opacity-100 active:scale-50'}`}
                  >
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