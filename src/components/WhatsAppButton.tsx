import { MessageCircle } from 'lucide-react';

export default function WhatsAppButton() {
  return (
    <a
      href="https://wa.me/573170817990"
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 bg-[#25D366] text-white h-14 rounded-full shadow-lg hover:bg-[#20bd5a] transition-all duration-500 flex items-center group overflow-hidden"
      aria-label="Contactar por WhatsApp"
    >
      <div className="flex items-center justify-center w-14 h-14 shrink-0">
        <MessageCircle size={28} />
      </div>
      <span className="max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-[400px] transition-all duration-500 ease-in-out opacity-0 group-hover:opacity-100 group-hover:pr-6 text-sm font-medium">
        ¿Quieres ser mayorista? Comunícate con nosotros.
      </span>
    </a>
  );
}
