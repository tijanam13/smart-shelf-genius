import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, Copy, UserPlus, Trash2, Crown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import BottomNav from '@/components/BottomNav';
import { useNavigate } from 'react-router-dom';

interface FamilyGroup {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
}

interface Member {
  id: string;
  user_id: string;
  joined_at: string;
  profile?: {
    display_name: string | null;
    email: string | null;
    phone: string | null;
  };
}

const Family = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [group, setGroup] = useState<FamilyGroup | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadGroup();
  }, [user, navigate]);

  const loadGroup = async () => {
    if (!user) return;
    setLoading(true);

    // Check if user owns a group
    const { data: ownedGroup } = await supabase
      .from('family_groups')
      .select('*')
      .eq('owner_id', user.id)
      .maybeSingle();

    if (ownedGroup) {
      setGroup(ownedGroup);
      await loadMembers(ownedGroup.id, user.id);
      setLoading(false);
      return;
    }

    // Check if user is a member of any group
    const { data: membership } = await supabase
      .from('family_members')
      .select('group_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (membership) {
      const { data: memberGroup } = await supabase
        .from('family_groups')
        .select('*')
        .eq('id', membership.group_id)
        .single();
      if (memberGroup) {
        setGroup(memberGroup);
        await loadMembers(memberGroup.id, user.id);
      }
    }
    setLoading(false);
  };

  const loadMembers = async (groupId: string, currentUserId: string) => {
    // Get owner profile
    const { data: groupData } = await supabase
      .from('family_groups')
      .select('owner_id')
      .eq('id', groupId)
      .single();

    const { data: memberRows } = await supabase
      .from('family_members')
      .select('*')
      .eq('group_id', groupId);

    if (!memberRows || !groupData) return;

    // Fetch profiles for all members + owner
    const allUserIds = [...new Set([groupData.owner_id, ...memberRows.map(m => m.user_id)])];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, display_name, email, phone')
      .in('user_id', allUserIds);

    const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

    const enrichedMembers: Member[] = allUserIds.map(uid => {
      const memberRow = memberRows.find(m => m.user_id === uid);
      return {
        id: memberRow?.id || uid,
        user_id: uid,
        joined_at: memberRow?.joined_at || '',
        profile: profileMap.get(uid) || undefined,
      };
    });

    setMembers(enrichedMembers);
  };

  const createGroup = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('family_groups')
      .insert({ owner_id: user.id, name: 'Moja porodica' })
      .select()
      .single();

    if (error) {
      toast({ title: 'Greška', description: error.message, variant: 'destructive' });
    } else if (data) {
      // Add owner as member too
      await supabase.from('family_members').insert({ group_id: data.id, user_id: user.id });
      setGroup(data);
      await loadMembers(data.id, user.id);
      toast({ title: 'Grupa kreirana!', description: `Tvoj kod za poziv: ${data.invite_code}` });
    }
  };

  const joinGroup = async () => {
    if (!user || !joinCode.trim()) return;
    const { data: foundGroup } = await supabase
      .from('family_groups')
      .select('*')
      .eq('invite_code', joinCode.trim().toLowerCase())
      .maybeSingle();

    if (!foundGroup) {
      toast({ title: 'Greška', description: 'Nevažeći kod za poziv.', variant: 'destructive' });
      return;
    }

    const { error } = await supabase
      .from('family_members')
      .insert({ group_id: foundGroup.id, user_id: user.id });

    if (error) {
      toast({ title: 'Greška', description: error.message === 'duplicate key value violates unique constraint "family_members_group_id_user_id_key"' ? 'Već si član ove grupe.' : error.message, variant: 'destructive' });
    } else {
      setGroup(foundGroup);
      await loadMembers(foundGroup.id, user.id);
      setJoinCode('');
      toast({ title: 'Uspešno!', description: `Pridružio/la si se grupi "${foundGroup.name}".` });
    }
  };

  const removeMember = async (memberId: string, memberUserId: string) => {
    if (!group || !user) return;
    if (memberUserId === group.owner_id) return;

    await supabase.from('family_members').delete().eq('id', memberId);
    setMembers(prev => prev.filter(m => m.id !== memberId));
    toast({ title: 'Uklonjeno', description: 'Član je uklonjen iz grupe.' });
  };

  const copyCode = () => {
    if (group) {
      navigator.clipboard.writeText(group.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Učitavanje...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-x-hidden">
      <div className="absolute top-0 left-1/3 w-[500px] h-[500px] rounded-full bg-mint/5 blur-[140px] pointer-events-none" />

      <div className="relative z-10 pb-28 px-5 pt-12 lg:px-8 xl:px-16 2xl:px-24">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold text-foreground">Porodica</h1>
          <p className="text-muted-foreground text-sm mt-1">Upravljaj članovima zajednice</p>
        </motion.div>

        {!group ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-8 max-w-lg space-y-6">
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-bold text-foreground">Kreiraj grupu</h2>
                  <p className="text-muted-foreground text-xs">Pozovi porodicu da prati namirnice zajedno</p>
                </div>
              </div>
              <Button onClick={createGroup} className="w-full">
                <Users className="w-4 h-4 mr-2" /> Kreiraj porodičnu grupu
              </Button>
            </div>

            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
                  <UserPlus className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-bold text-foreground">Pridruži se</h2>
                  <p className="text-muted-foreground text-xs">Unesi kod koji si dobio/la od člana</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="Unesi kod..."
                  className="bg-secondary/50 border-border/50"
                />
                <Button onClick={joinGroup}>Pridruži se</Button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-8 max-w-lg space-y-6">
            {/* Invite code section */}
            <div className="glass-card rounded-2xl p-6">
              <h2 className="font-display text-lg font-bold text-foreground mb-1">{group.name}</h2>
              <p className="text-muted-foreground text-xs mb-4">Podeli kod sa članovima porodice</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-secondary/50 border border-border/50 rounded-lg px-4 py-3 font-mono text-lg tracking-widest text-foreground text-center">
                  {group.invite_code.toUpperCase()}
                </div>
                <Button variant="outline" size="icon" onClick={copyCode}>
                  {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            {/* Members list */}
            <div className="glass-card rounded-2xl p-6">
              <h3 className="font-display text-base font-bold text-foreground mb-4">
                Članovi ({members.length})
              </h3>
              <div className="space-y-3">
                {members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/30">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                        <span className="font-display text-sm font-bold text-primary">
                          {member.profile?.display_name?.[0]?.toUpperCase() || '?'}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-foreground">
                            {member.profile?.display_name || 'Korisnik'}
                          </p>
                          {member.user_id === group.owner_id && (
                            <Crown className="w-3.5 h-3.5 text-token" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{member.profile?.email}</p>
                        {member.profile?.phone && (
                          <p className="text-xs text-muted-foreground">{member.profile.phone}</p>
                        )}
                      </div>
                    </div>
                    {user?.id === group.owner_id && member.user_id !== group.owner_id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => removeMember(member.id, member.user_id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default Family;
