import { useState } from 'react';
import { Instagram } from 'lucide-react';
import OurStory from './OurStory';
import Certifications from './Certifications';
import PrivacyModal from './PrivacyModal';
import CookiesModal from './CookiesModal';
import ShippingModal from './ShippingModal';
import WarrantyModal from './WarrantyModal';
import ReturnsModal from './ReturnsModal';
import TermsModal from './TermsModal';

export default function Footer() {
  const [isStoryOpen, setIsStoryOpen] = useState(false);
  const [isCertificationsOpen, setIsCertificationsOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isCookiesOpen, setIsCookiesOpen] = useState(false);
  const [isShippingOpen, setIsShippingOpen] = useState(false);
  const [isWarrantyOpen, setIsWarrantyOpen] = useState(false);
  const [isReturnsOpen, setIsReturnsOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);

  return (
    <footer className="bg-black text-white pt-20 pb-8 px-4 sm:px-6 lg:px-8 border-t-[3px] border-gold relative overflow-hidden">
      {/* Subtle background gold glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-200 h-50 bg-gold/5 blur-[120px] rounded-full pointer-events-none"></div>
      
      <div className="max-w-6xl mx-auto relative z-10">
        {/* Links Section */}
        <div className="flex flex-wrap justify-between gap-8 mb-16">
          {/* Column 1 */}
          <div className="space-y-6">
            <h4 className="font-serif text-lg text-gold">Acerca de Exotic</h4>
            <ul className="space-y-4 font-sans font-light text-sm text-white/60">
              <li><button onClick={(e) => { e.preventDefault(); setIsStoryOpen(true); }} className="hover:text-gold transition-colors">Nuestra Historia</button></li>
              <li><button onClick={(e) => { e.preventDefault(); setIsCertificationsOpen(true); }} className="hover:text-gold transition-colors">Certificaciones</button></li>
              <li><button onClick={(e) => { e.preventDefault(); setIsWarrantyOpen(true); }} className="hover:text-gold transition-colors">Garantía</button></li>
            </ul>
          </div>

          {/* Column 2 */}
          <div className="space-y-6">
            <h4 className="font-serif text-lg text-gold">Atención al Cliente</h4>
            <ul className="space-y-4 font-sans font-light text-sm text-white/60">
              <li><a href="https://wa.me/573170817990" target="_blank" rel="noopener noreferrer" className="hover:text-gold transition-colors">Contacto</a></li>
              <li><button onClick={(e) => { e.preventDefault(); setIsReturnsOpen(true); }} className="hover:text-gold transition-colors">Política de Devolución</button></li>
              <li><button onClick={(e) => { e.preventDefault(); setIsShippingOpen(true); }} className="hover:text-gold transition-colors">Envíos</button></li>
            </ul>
          </div>

          {/* Column 3 */}
          <div className="space-y-6">
            <h4 className="font-serif text-lg text-gold">Legal</h4>
            <ul className="space-y-4 font-sans font-light text-sm text-white/60">
              <li><button onClick={(e) => { e.preventDefault(); setIsTermsOpen(true); }} className="hover:text-gold transition-colors">Términos y Condiciones</button></li>
              <li><button onClick={(e) => { e.preventDefault(); setIsPrivacyOpen(true); }} className="hover:text-gold transition-colors">Política de Privacidad</button></li>
              <li><button onClick={(e) => { e.preventDefault(); setIsCookiesOpen(true); }} className="hover:text-gold transition-colors">Cookies</button></li>
            </ul>
          </div>

          {/* Column 4 */}
          <div className="space-y-6">
            <h4 className="font-serif text-lg text-gold">Síguenos</h4>
            <div className="flex space-x-4">
              <a href="https://www.instagram.com/exoticjoyeria16?igsh=MTMxbGM2anpwbnJzZg==&utm_source=ig_contact_invite" target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-gold transition-colors" aria-label="Instagram">
                <Instagram size={20} strokeWidth={1.5} />
              </a>
              <a href="https://www.tiktok.com/@exotic.joyeria0?_r=1&_t=ZS-94rP1BS4oHX" target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-gold transition-colors" aria-label="TikTok">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
                </svg>
              </a>
              <a href="https://wa.me/573170817990" target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-gold transition-colors" aria-label="WhatsApp">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>

        <div className="w-full h-px bg-white/10 mb-8"></div>

        {/* Bottom Bar */}
        <div className="text-center">
          <p className="font-sans text-sm text-white/40 font-light">
            © {new Date().getFullYear()} Exotic Joyería. Todos los derechos reservados.
          </p>
        </div>
      </div>

      <OurStory isOpen={isStoryOpen} onClose={() => setIsStoryOpen(false)} />
      <Certifications isOpen={isCertificationsOpen} onClose={() => setIsCertificationsOpen(false)} />
      <PrivacyModal isOpen={isPrivacyOpen} onClose={() => setIsPrivacyOpen(false)} />
      <CookiesModal isOpen={isCookiesOpen} onClose={() => setIsCookiesOpen(false)} />
      <ShippingModal isOpen={isShippingOpen} onClose={() => setIsShippingOpen(false)} />
      <WarrantyModal isOpen={isWarrantyOpen} onClose={() => setIsWarrantyOpen(false)} />
      <ReturnsModal isOpen={isReturnsOpen} onClose={() => setIsReturnsOpen(false)} />
      <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />
    </footer>
  );
}
