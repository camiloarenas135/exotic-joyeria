import { useEffect, useRef, useState } from 'react';
import { readSafeLocalStorage } from '../lib/sanitize';

function WhatsAppIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="white"
      aria-hidden="true"
    >
      <path d="M16.003 2C8.28 2 2 8.28 2 16.003c0 2.47.65 4.88 1.88 7.01L2 30l7.18-1.85A13.93 13.93 0 0 0 16.003 30C23.72 30 30 23.72 30 16.003 30 8.28 23.72 2 16.003 2zm0 25.46a11.41 11.41 0 0 1-5.83-1.6l-.42-.25-4.26 1.1 1.12-4.14-.27-.43a11.44 11.44 0 0 1-1.77-6.14c0-6.32 5.14-11.46 11.46-11.46 3.06 0 5.94 1.19 8.1 3.36a11.4 11.4 0 0 1 3.36 8.1c-.01 6.32-5.15 11.46-11.49 11.46zm6.29-8.58c-.34-.17-2.02-1-2.34-1.11-.32-.11-.55-.17-.78.17s-.9 1.11-1.1 1.34c-.2.23-.4.26-.74.09-.34-.17-1.44-.53-2.74-1.69-1.01-.9-1.7-2.01-1.9-2.35-.2-.34-.02-.53.15-.7.15-.15.34-.4.51-.6.17-.2.23-.34.34-.57.11-.23.06-.43-.03-.6-.09-.17-.78-1.88-1.07-2.58-.28-.67-.57-.58-.78-.59l-.66-.01c-.23 0-.6.09-.91.43-.31.34-1.2 1.17-1.2 2.86s1.23 3.32 1.4 3.55c.17.23 2.42 3.7 5.87 5.19.82.35 1.46.56 1.96.72.82.26 1.57.22 2.16.13.66-.1 2.02-.83 2.31-1.62.29-.8.29-1.48.2-1.62-.08-.15-.31-.24-.65-.41z" />
    </svg>
  );
}

const OPEN_DELAY_MS  = 800;
const AUTO_CLOSE_MS  = 4000;
const WA_NUMBER      = '573170817990';

function buildWhatsAppHref(userName: string | null): string {
  const base = `https://wa.me/${WA_NUMBER}`;
  if (!userName) return base;
  const message = `¡Hola! Me llamo ${userName} y estoy interesado/a en conocer los planes de mayorista de Exotic Joyería. ¿Me podrían brindar más información sobre precios, mínimos de compra y condiciones? ¡Gracias! 💍`;
  return `${base}?text=${encodeURIComponent(message)}`;
}

export default function WhatsAppButton() {
  const [isMobile, setIsMobile] = useState(false);
  const [showBubble, setShowBubble] = useState(false);
  const [whatsappHref, setWhatsappHref] = useState(buildWhatsAppHref(null));
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const mobile = window.matchMedia('(pointer: coarse)').matches;
    setIsMobile(mobile);

    // Read user name safely — respects 30-day TTL and re-sanitizes against DevTools tampering
    const storedName = readSafeLocalStorage('user_name', 100);
    setWhatsappHref(buildWhatsAppHref(storedName));

    if (mobile) {
      const openTimer = setTimeout(() => {
        setShowBubble(true);
        closeTimer.current = setTimeout(() => setShowBubble(false), AUTO_CLOSE_MS);
      }, OPEN_DELAY_MS);

      return () => {
        clearTimeout(openTimer);
        if (closeTimer.current) clearTimeout(closeTimer.current);
      };
    }
  }, []);

  return (
    /* Contenedor posicionado en la esquina inferior derecha */
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">

      {/* ── Burbuja de mensaje (solo móvil) ── */}
      {isMobile && (
        <div
          aria-live="polite"
          style={{
            maxWidth: 'calc(100vw - 5rem)', // nunca desborda la pantalla
            opacity: showBubble ? 1 : 0,
            transform: showBubble ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.95)',
            pointerEvents: showBubble ? 'auto' : 'none',
            transition: 'opacity 0.4s ease, transform 0.4s ease',
            background: 'white',
            color: '#111',
            borderRadius: '1rem',
            borderBottomRightRadius: '0.25rem',
            padding: '0.55rem 0.9rem',
            fontSize: '0.8rem',
            fontWeight: 500,
            lineHeight: 1.4,
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            whiteSpace: 'normal',
            wordBreak: 'break-word',
          }}
        >
          ¿Quieres ser mayorista?<br />Comunícate con nosotros.
        </div>
      )}

      {/* ── Botón circular ── */}
      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Contactar por WhatsApp"
        onClick={() => {
          if (isMobile) {
            setShowBubble(false);
            if (closeTimer.current) clearTimeout(closeTimer.current);
          }
        }}
        className="group bg-[#25D366] hover:bg-[#20bd5a] text-white h-14 w-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110"
      >
        {/* Desktop: el texto se expande desde el ícono */}
        <span className="hidden group-hover:hidden" />
        <WhatsAppIcon size={28} />

        {/* Tooltip desktop (hover) */}
        <span className="
          hidden md:block
          absolute right-16 bottom-1
          bg-white text-gray-800 text-xs font-medium
          px-3 py-1.5 rounded-lg rounded-br-none shadow-md
          whitespace-nowrap
          opacity-0 pointer-events-none
          group-hover:opacity-100 group-hover:pointer-events-auto
          transition-opacity duration-300
        ">
          ¿Quieres ser mayorista? Comunícate con nosotros.
        </span>
      </a>
    </div>
  );
}

