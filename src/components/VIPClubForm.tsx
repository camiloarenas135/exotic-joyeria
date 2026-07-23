import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Send, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { sanitizeString, sanitizePhone, writeSafeLocalStorage, readSafeLocalStorage } from '../lib/sanitize';
import { checkRateLimit, formatCooldown } from '../lib/rateLimiter';

export default function VIPClubForm() {
  const { isVIPFormOpen, setIsVIPFormOpen, setUserName } = useAppContext();
  const [hasRegistered, setHasRegistered] = useState(true); 

  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [successTitle, setSuccessTitle] = useState('¡Registro Exitoso!');
  const [successSubtitle, setSuccessSubtitle] = useState('Gracias por unirte. Pronto recibirás nuestras novedades.');

  useEffect(() => {
    // Verificar si el usuario ya se registró previamente (respeta expiración de 30 días)
    const registered = readSafeLocalStorage('vip_registered');
    if (!registered) {
      setHasRegistered(false);
      // Mostrar el recuadro después de 2 segundos de entrar a la página
      const timer = setTimeout(() => setIsVIPFormOpen(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [setIsVIPFormOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sanitizedName = sanitizeString(name);
    const sanitizedPhone = sanitizePhone(whatsapp);

    if (sanitizedName.length < 2 || sanitizedName.length > 50) {
      setErrorMessage('El nombre debe tener entre 2 y 50 caracteres.');
      setStatus('error');
      return;
    }
    
    if (sanitizedPhone.length < 8 || sanitizedPhone.length > 20) {
      setErrorMessage('Por favor ingresa un número de WhatsApp válido.');
      setStatus('error');
      return;
    }

    // Rate limit: máximo 3 registros por 24 horas por navegador
    const { allowed, remainingMs } = checkRateLimit('vip_register', 3, 24 * 60 * 60 * 1000);
    if (!allowed) {
      setErrorMessage(`Demasiados intentos. Espera ${formatCooldown(remainingMs)} antes de volver a intentarlo.`);
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    try {
      const { error } = await supabase
        .from('vip_members')
        .insert([{
          name: sanitizedName,
          whatsapp: sanitizedPhone,
        }]);

      if (error) {
        // Detectar si el número de teléfono o registro ya existe en la base de datos (Unique Key / 23505)
        const isDuplicate = 
          error.code === '23505' || 
          error.message?.toLowerCase().includes('unique') || 
          error.message?.toLowerCase().includes('already exists') || 
          error.message?.toLowerCase().includes('duplicate') ||
          error.message?.toLowerCase().includes('violates');

        if (isDuplicate) {
          setSuccessTitle('¡Ya estás registrado!');
          setSuccessSubtitle(`El número ${sanitizedPhone} ya forma parte de nuestro Club VIP. ¡Bienvenido/a de nuevo!`);
          setStatus('success');

          writeSafeLocalStorage('vip_registered', 'true');
          writeSafeLocalStorage('user_name', sanitizedName);
          writeSafeLocalStorage('user_whatsapp', sanitizedPhone);
          setUserName(sanitizedName);

          setTimeout(() => {
            setIsVIPFormOpen(false);
            setHasRegistered(true);
          }, 3000);
          return;
        }

        throw error;
      }
      
      setSuccessTitle('¡Registro Exitoso!');
      setSuccessSubtitle('Gracias por unirte. Pronto recibirás nuestras novedades.');
      setStatus('success');

      // Guardar en el navegador con expiración de 30 días
      writeSafeLocalStorage('vip_registered', 'true');
      writeSafeLocalStorage('user_name', sanitizedName);
      writeSafeLocalStorage('user_whatsapp', sanitizedPhone);
      setUserName(sanitizedName);
      
      // Cerrar el recuadro automáticamente después de 3 segundos
      setTimeout(() => {
        setIsVIPFormOpen(false);
        setHasRegistered(true);
      }, 3000);
      
    } catch (error: any) {
      console.error('Error registering VIP member:', error);
      setStatus('error');
      setErrorMessage('Hubo un problema al registrarte. Inténtalo de nuevo.');
    }
  };

  // Si ya se registró o el recuadro está cerrado, no renderizar nada
  if (hasRegistered && !isVIPFormOpen) return null;
  if (!isVIPFormOpen) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-zinc-900 border border-gold/20 rounded-2xl w-full max-w-md relative overflow-hidden shadow-2xl">
        {/* Botón para cerrar */}
        <button 
          onClick={() => setIsVIPFormOpen(false)}
          className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors z-10"
          aria-label="Cerrar"
        >
          <X size={24} />
        </button>

        <div className="p-8 text-center">
          <h2 className="font-serif text-3xl text-gold mb-3">Registro de Cliente</h2>
          <p className="font-sans font-light text-white/80 mb-6 text-sm">
            Para procesar tu pedido y enviarte ofertas exclusivas, por favor ingresa tus datos.
          </p>

          {status === 'success' ? (
            <div className="bg-white/5 border border-gold/30 rounded-xl p-6 flex flex-col items-center justify-center space-y-3 animate-in fade-in duration-500">
              <CheckCircle2 className="text-gold w-12 h-12" />
              <h3 className="text-lg font-serif text-gold">{successTitle}</h3>
              <p className="text-white/80 font-light text-sm">
                {successSubtitle}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 text-left">
              <div>
                <label htmlFor="name" className="block text-xs font-light text-white/80 mb-1">Nombre completo</label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Juan Pérez"
                  maxLength={50}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder:text-white/30 focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all text-sm"
                  required
                  disabled={status === 'loading'}
                />
              </div>
              
              <div>
                <label htmlFor="whatsapp" className="block text-xs font-light text-white/80 mb-1">Número de WhatsApp</label>
                <input
                  type="tel"
                  id="whatsapp"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="Ej. +57 300 123 4567"
                  maxLength={20}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder:text-white/30 focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all text-sm"
                  required
                  disabled={status === 'loading'}
                />
              </div>

              {status === 'error' && (
                <div className="flex items-center space-x-2 text-red-400 text-xs bg-red-400/10 p-2.5 rounded-lg">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full bg-gold text-black font-medium py-2.5 rounded-lg hover:bg-white transition-colors flex items-center justify-center space-x-2 disabled:opacity-70 disabled:cursor-not-allowed mt-2 text-sm"
              >
                <span>{status === 'loading' ? 'Registrando...' : 'Quiero unirme'}</span>
                {status !== 'loading' && <Send size={16} />}
              </button>
              
              <p className="text-[10px] text-white/40 text-center mt-4 font-light leading-relaxed">
                Al registrarte, aceptas recibir mensajes de WhatsApp de Exotic Joyería. Tus datos están seguros con nosotros.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
