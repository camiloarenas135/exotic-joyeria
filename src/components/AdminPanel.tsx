import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { LogOut, Users, Calendar, Phone, User as UserIcon, ShieldAlert, LayoutGrid, Trash2, FileText, BarChart3 } from 'lucide-react';
import AdminCatalog from './AdminCatalog';
import AdminOrders from './AdminOrders';
import AdminStats from './AdminStats';

const ADMIN_EMAILS = [
  'kevinlgomez058@gmail.com',
  'camiloarenas135@gmail.com'
];

interface VIPMember {
  id: string;
  name: string;
  whatsapp: string;
  createdAt: string | null;
}

export default function AdminPanel() {
  const [user, setUser] = useState<any>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [members, setMembers] = useState<VIPMember[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [activeTab, setActiveTab] = useState<'vip' | 'catalog' | 'orders' | 'stats'>('orders');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Modales personalizados de confirmación y alerta
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [productToEditId, setProductToEditId] = useState<string | null>(null);


  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoadingAuth(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        setIsLoggingIn(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setMembers([]);
      return;
    }

    const email = user.email?.toLowerCase() || '';
    if (!ADMIN_EMAILS.includes(email)) {
      return; // No es admin, no cargar datos
    }

    loadVIPMembers();

    // Sincronización en tiempo real
    const channel = supabase
      .channel('vip-members-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vip_members' },
        () => loadVIPMembers()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  async function loadVIPMembers() {
    setLoadingData(true);
    try {
      const { data, error } = await supabase
        .from('vip_members')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setMembers(data.map((m: any) => ({
        id: m.id,
        name: m.name,
        whatsapp: m.whatsapp,
        createdAt: m.created_at
      })));
    } catch (error: any) {
      console.error('Error loading VIP members:', error);
      setAuthError('Error al cargar la lista de miembros.');
    } finally {
      setLoadingData(false);
    }
  }

  const handleDeleteMember = (id: string, name: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Eliminar Miembro VIP',
      message: `¿Estás seguro de que deseas eliminar a ${name} de la lista VIP?`,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const { error } = await supabase
            .from('vip_members')
            .delete()
            .eq('id', id);

          if (error) throw error;

          setMembers(members.filter(m => m.id !== id));
        } catch (error) {
          console.error('Error deleting member:', error);
          setAlertMessage('Hubo un error al eliminar el miembro.');
        }
      }
    });
  };

  const handleGoogleLogin = async () => {
    setAuthError(null);
    setIsLoggingIn(true);
    
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/admin',
        },
      });

      if (error) throw error;
    } catch (error: any) {
      console.error('Error al iniciar sesión con Google:', error);
      setAuthError('Error al conectar con Google. Por favor, intenta de nuevo.');
      setIsLoggingIn(false);
    }
  };


  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center text-gold">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gold"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
        <div className="bg-white border border-black/10 p-8 rounded-none max-w-md w-full text-center shadow-lg relative overflow-hidden">
          {/* Decorative Corners */}
          <div className="absolute top-0 left-0 w-8 h-8 border-t-[2px] border-l-[2px] border-gold/50 m-2 pointer-events-none"></div>
          <div className="absolute top-0 right-0 w-8 h-8 border-t-[2px] border-r-[2px] border-gold/50 m-2 pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[2px] border-l-[2px] border-gold/50 m-2 pointer-events-none"></div>
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[2px] border-r-[2px] border-gold/50 m-2 pointer-events-none"></div>

          <div className="h-16 mb-6 flex justify-center items-center">
            <img 
              src="/logo.png" 
              alt="Exotic Joyería" 
              className="h-full object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const fallback = document.getElementById('admin-fallback-logo');
                if (fallback) fallback.style.display = 'block';
              }}
            />
            <h1 id="admin-fallback-logo" className="hidden font-serif text-2xl tracking-widest text-black font-semibold">
              EXÓTIC
            </h1>
          </div>
          
          <h2 className="text-2xl font-serif text-black mb-2">Panel Administrativo</h2>
          <p className="text-black/60 font-light text-sm mb-8">
            Haz clic en el botón inferior para ingresar con tu correo de Google autorizado.
          </p>

          {authError && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-600 text-xs rounded-none">
              {authError}
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            disabled={isLoggingIn}
            className={`w-full bg-black text-white font-medium py-3 px-6 transition-all flex items-center justify-center space-x-3 uppercase tracking-wider text-xs border border-transparent ${
              isLoggingIn ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gold hover:shadow-lg'
            }`}
          >
            {isLoggingIn ? (
              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-white"></div>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            )}
            <span>{isLoggingIn ? 'Conectando...' : 'Continuar con Google'}</span>
          </button>

        </div>
      </div>
    );
  }

  const email = user.email?.toLowerCase() || '';
  const isAuthorized = ADMIN_EMAILS.includes(email);

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
        <div className="bg-white border border-red-500/30 p-8 rounded-none max-w-md w-full text-center shadow-lg">
          <ShieldAlert className="w-16 h-16 text-red-500 mx-auto mb-6" />
          <h1 className="text-2xl font-serif text-black mb-2">Acceso Denegado</h1>
          <p className="text-black/60 font-light text-sm mb-8">
            La cuenta <strong>{user.email}</strong> no tiene permisos de administrador para ver esta página.
          </p>
          <button
            onClick={handleLogout}
            className="w-full bg-black text-white font-medium py-3 hover:bg-zinc-800 transition-colors flex items-center justify-center space-x-2"
          >
            <LogOut size={18} />
            <span className="uppercase tracking-wider text-xs">Cerrar sesión y volver</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-black p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-black/10">
          <div className="flex items-center gap-6">
            <div className="h-12 hidden md:block">
              <img 
                src="/logo.png" 
                alt="Exotic Joyería" 
                className="h-full object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const fallback = document.getElementById('admin-header-fallback-logo');
                  if (fallback) fallback.style.display = 'block';
                }}
              />
              <span id="admin-header-fallback-logo" className="hidden font-serif text-xl tracking-widest text-black font-semibold">
                EXÓTIC
              </span>
            </div>
            <div className="w-px h-10 bg-black/10 hidden md:block"></div>
            <div>
              <h1 className="text-2xl md:text-3xl font-serif text-black mb-1">Panel de Administración</h1>
              <p className="text-black/50 font-light text-sm tracking-wider uppercase">Gestiona tu negocio</p>
            </div>
          </div>
          <div className="flex items-center gap-4 bg-gray-50 px-4 py-2 border border-black/10">
            <div className="flex items-center gap-2">
              <div className="bg-gold/10 p-2 rounded-full border border-gold/50">
                <UserIcon size={16} className="text-gold" />
              </div>
              <span className="text-sm font-medium text-black/80 hidden sm:block">{user.email}</span>
            </div>
            <div className="w-px h-6 bg-black/10"></div>
            <button 
              onClick={handleLogout}
              className="text-black/50 hover:text-red-500 transition-colors"
              title="Cerrar sesión"
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-black/10">
          <button
            onClick={() => setActiveTab('orders')}
            className={`pb-4 px-4 text-sm uppercase tracking-wider font-medium transition-colors border-b-2 ${
              activeTab === 'orders' ? 'border-gold text-gold' : 'border-transparent text-black/50 hover:text-black'
            } flex items-center gap-2`}
          >
            <FileText size={18} />
            <span>Pedidos</span>
          </button>
          <button
            onClick={() => setActiveTab('catalog')}
            className={`pb-4 px-4 text-sm uppercase tracking-wider font-medium transition-colors border-b-2 ${
              activeTab === 'catalog' ? 'border-gold text-gold' : 'border-transparent text-black/50 hover:text-black'
            } flex items-center gap-2`}
          >
            <LayoutGrid size={18} />
            <span>Catálogo</span>
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`pb-4 px-4 text-sm uppercase tracking-wider font-medium transition-colors border-b-2 ${
              activeTab === 'stats' ? 'border-gold text-gold' : 'border-transparent text-black/50 hover:text-black'
            } flex items-center gap-2`}
          >
            <BarChart3 size={18} />
            <span>Estadísticas</span>
          </button>
          <button
            onClick={() => setActiveTab('vip')}
            className={`pb-4 px-4 text-sm uppercase tracking-wider font-medium transition-colors border-b-2 ${
              activeTab === 'vip' ? 'border-gold text-gold' : 'border-transparent text-black/50 hover:text-black'
            } flex items-center gap-2`}
          >
            <Users size={18} />
            <span>Miembros VIP</span>
          </button>
        </div>

        {activeTab === 'vip' ? (
          <>
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white border border-black/10 shadow-sm p-6 flex items-center gap-4 relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gold"></div>
                <div className="bg-gold/10 p-4 text-gold">
                  <Users size={24} />
                </div>
                <div>
                  <p className="text-black/50 text-xs tracking-widest uppercase font-light mb-1">Total Registrados</p>
                  <p className="text-3xl font-serif text-black">{members.length}</p>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white border border-black/10 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-black/10 bg-gray-50/50">
                <h2 className="text-xl font-serif text-black">Miembros del Club VIP</h2>
              </div>
              
              <div className="overflow-x-auto">
                {loadingData ? (
                  <div className="p-12 text-center text-black/50 font-light">Cargando datos...</div>
                ) : members.length === 0 ? (
                  <div className="p-12 text-center text-black/50 font-light">Aún no hay miembros registrados.</div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 text-black/60 text-xs uppercase tracking-wider font-light border-b border-black/10">
                        <th className="px-6 py-4 font-medium">Nombre</th>
                        <th className="px-6 py-4 font-medium">WhatsApp</th>
                        <th className="px-6 py-4 font-medium">Fecha de Registro</th>
                        <th className="px-6 py-4 font-medium text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      {members.map((member) => (
                        <tr key={member.id} className="hover:bg-gray-50/80 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="bg-gray-100 p-2 rounded-full text-black/40">
                                <UserIcon size={16} />
                              </div>
                              <span className="font-medium text-black">{member.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 text-black/80">
                              <Phone size={14} className="text-gold" />
                              <a 
                                href={`https://wa.me/${member.whatsapp.replace(/\D/g, '')}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="hover:text-gold transition-colors font-medium"
                              >
                                {member.whatsapp}
                              </a>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 text-black/50 text-sm">
                              <Calendar size={14} />
                              <span>
                                {member.createdAt 
                                  ? new Intl.DateTimeFormat('es-CO', { 
                                      dateStyle: 'medium', 
                                      timeStyle: 'short' 
                                    }).format(new Date(member.createdAt))
                                  : 'Desconocida'}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => handleDeleteMember(member.id, member.name)}
                              className="text-black/30 hover:text-red-500 transition-colors p-2"
                              title="Eliminar miembro"
                            >
                              <Trash2 size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        ) : activeTab === 'catalog' ? (
          <AdminCatalog 
            editProductId={productToEditId} 
            onClearEditProduct={() => setProductToEditId(null)} 
          />
        ) : activeTab === 'stats' ? (
          <AdminStats 
            onEditProduct={(productId) => {
              setActiveTab('catalog');
              setProductToEditId(productId);
            }} 
          />
        ) : (
          <AdminOrders />
        )}
      </div>

      {/* Modal de Confirmación Personalizado */}
      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm border border-black/10 shadow-2xl p-6">
            <h3 className="font-serif text-xl text-black mb-4">{confirmModal.title}</h3>
            <p className="text-black/70 text-sm mb-6">{confirmModal.message}</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setConfirmModal(null)}
                className="flex-1 border border-black/20 text-black py-2 hover:bg-gray-50 transition-colors uppercase tracking-wider text-xs font-medium"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmModal.onConfirm}
                className="flex-1 bg-black text-white py-2 hover:bg-gold transition-colors uppercase tracking-wider text-xs font-medium"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Alerta Personalizado */}
      {alertMessage && (
        <div className="fixed inset-0 bg-black/50 z-[90] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm border border-black/10 shadow-2xl p-6">
            <h3 className="font-serif text-xl text-black mb-4">Aviso</h3>
            <p className="text-black/70 text-sm mb-6">{alertMessage}</p>
            <button 
              onClick={() => setAlertMessage(null)}
              className="w-full bg-black text-white py-2 hover:bg-gold transition-colors uppercase tracking-wider text-xs font-medium"
            >
              Aceptar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
