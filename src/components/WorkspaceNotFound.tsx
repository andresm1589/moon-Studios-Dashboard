import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { BrandLogo } from './BrandLogo';

export default function WorkspaceNotFound() {
  const { currentUser } = useAuth();
  return <main className="moon-not-found"><BrandLogo /><div className="moon-not-found-orbit" aria-hidden="true">404</div><span className="moon-eyebrow">FUERA DE ÓRBITA</span><h1>Este espacio no existe.</h1><p>El enlace pudo cambiar o la dirección está incompleta.<br />Vuelve a tu espacio para continuar.</p><Link to={currentUser ? '/dashboard' : '/'}><ArrowLeft size={16} />{currentUser ? 'Volver al dashboard' : 'Ir al acceso'}<ArrowUpRight size={16} /></Link></main>;
}
