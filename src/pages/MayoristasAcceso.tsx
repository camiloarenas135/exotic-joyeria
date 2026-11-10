import type React from 'react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useChannel } from '../context/ChannelContext';
import { AuthPanel, RecoveryPanel, RequestAccessForm } from '../components/WholesaleAuth';

/** /mayoristas/acceso: Ingresar / Registrarme / Olvidé; recuperación de contraseña; solicitud para cuentas ya existentes. */
export default function MayoristasAcceso() {
  const { session, wholesaler, resolving, recovery, clearRecovery } = useChannel();
  const [params] = useSearchParams();
  const initialType = params.get('tipo') === 'emprendedor' ? 'entrepreneur' : 'wholesale';
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Acceso mayoristas y emprendedores | Exotic Joyería';
  }, []);

  let body: React.ReactNode;
  if (resolving) body = <p className="text-center text-black/60">Cargando…</p>;
  else if (recovery && session)
    body = (
      <RecoveryPanel
        onDone={() => {
          clearRecovery();
          setNotice('Tu contraseña fue actualizada. Ya puedes usar tu cuenta.');
        }}
      />
    );
  else if (session && wholesaler) return <Navigate to={wholesaler.status === 'approved' ? '/' : '/mayoristas'} replace />;
  else if (session) body = <RequestAccessForm initialType={initialType} />;
  else body = <AuthPanel initialMode={params.get('tab') === 'registro' ? 'register' : 'login'} initialType={initialType} />;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <nav aria-label="Migas de pan" className="text-xs text-black/60 mb-4 flex items-center gap-2">
        <Link to="/" className="hover:text-ink">Inicio</Link>
        <span aria-hidden>/</span>
        <Link to="/mayoristas" className="hover:text-ink">Mayorista</Link>
        <span aria-hidden>/</span>
        <span className="text-ink">Acceso</span>
      </nav>
      <div className="mb-10">
        <p className="text-xs uppercase tracking-[0.25em] text-gold-dark mb-2">Zona mayorista</p>
        <h1 className="font-serif text-3xl md:text-4xl text-ink">Acceso para negocios</h1>
        <div className="h-px w-16 bg-gold mt-4" />
      </div>
      {notice && (
        <div role="status" className="max-w-md mx-auto mb-6 p-3 bg-green-50 border border-green-200 text-green-900 text-sm flex justify-between gap-3">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Cerrar aviso">×</button>
        </div>
      )}
      {body}
    </section>
  );
}
