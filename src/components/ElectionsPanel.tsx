import { useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { auth, db } from '@/lib/firebase';
import { supabase } from '@/lib/supabaseclient';
import ElectionWorkspace from '@/electoral/ElectionWorkspace';
import { useElectionSystem } from '@/electoral/useElectionSystem';
import type { ElectoralIdentity } from '@/electoral/types';

function ElectoralWorkspace({ identity }: { identity: ElectoralIdentity }) {
  const uploadPhoto = useCallback(async (file: File, electionId: string) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 4 * 1024 * 1024) throw new Error('Usa una imagen JPG, PNG o WebP de hasta 4 MB.');
    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${electionId}/${identity.uid}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from('candidates').upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new Error('No se pudo subir la foto. Inténtalo de nuevo o envía la candidatura sin foto.');
    return supabase.storage.from('candidates').getPublicUrl(path).data.publicUrl;
  }, [identity.uid]);
  const system = useElectionSystem({ db, identity, uploadPhoto });
  return <div className="moon-module moon-module--elections"><ElectionWorkspace system={system} basePath="/dashboard/elecciones" embedded logoUrl="/brand/moon-wordmark.svg" /></div>;
}

export default function ElectionsPanel() {
  const { userProfile } = useAuth();
  const identity = useMemo(() => userProfile ? { uid: userProfile.uid, displayName: userProfile.displayName, role: userProfile.role, email: auth.currentUser?.email || '', emailVerified: auth.currentUser?.emailVerified === true, photoURL: userProfile.avatar } : null, [userProfile]);
  return identity ? <ElectoralWorkspace identity={identity} /> : <p role="status">Confirmando tu acceso al sistema electoral…</p>;
}
