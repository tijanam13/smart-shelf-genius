import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Save, LogOut, Crown } from 'lucide-react';
import PhoneInput from '@/components/PhoneInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { usePremium } from '@/contexts/PremiumContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import BottomNav from '@/components/BottomNav';
import { useNavigate, useSearchParams } from 'react-router-dom';

const Profile = () => {
  const { user, signOut } = useAuth();
  const { isPremium, refresh: refreshPremium } = usePremium();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    setEmail(user.email || '');
    setDisplayName(user.user_metadata?.display_name || user.email?.split('@')[0] || '');

    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        setDisplayName(data.display_name || user.user_metadata?.display_name || '');
        setEmail(data.email || user.email || '');
        setPhone(data.phone || user.user_metadata?.phone || '');
      } else {
        // Fallback to user metadata if profile fetch fails
        setPhone(user.user_metadata?.phone || '');
      }
    };
    fetchProfile();
  }, [user, navigate]);

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);

    // Check phone uniqueness if phone is provided
    if (phone.trim()) {
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', phone.trim())
        .neq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        toast({ title: 'Error', description: 'This phone number is already registered to another account.', variant: 'destructive' });
        setLoading(false);
        return;
      }
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName.trim(),
        phone: phone.trim() || null,
      })
      .eq('user_id', user.id);
    setLoading(false);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Saved!', description: 'Your profile has been updated.' });
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background relative overflow-x-hidden">
      <div className="absolute top-0 left-1/3 w-[500px] h-[500px] rounded-full bg-mint/5 blur-[140px] pointer-events-none" />

      <div className="relative z-10 pb-28 px-5 pt-12 lg:px-8 xl:px-16 2xl:px-24 flex flex-col items-center">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg">
          <h1 className="font-display text-2xl font-bold text-foreground">My Profile</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your account details</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-8 w-full max-w-lg"
        >
          <div className="glass-card rounded-2xl p-6 space-y-5">
            <div className="flex items-center gap-4 mb-2">
              <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center">
                <span className="font-display text-2xl font-bold text-primary">
                  {displayName ? displayName[0].toUpperCase() : 'U'}
                </span>
              </div>
              <div>
                <h2 className="font-display text-lg font-bold text-foreground">{displayName || 'User'}</h2>
                <p className="text-muted-foreground text-sm">{email}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="pl-10 bg-secondary/50 border-border/50"
                    placeholder="Enter your full name"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input value={email} disabled className="pl-10 bg-secondary/50 border-border/50 opacity-60" />
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Phone Number</label>
                <PhoneInput value={phone} onChange={setPhone} />
              </div>
            </div>

            {/* Premium Section */}
            <div className="pt-2 border-t border-border/50">
              {isPremium ? (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-500/30">
                  <Crown className="w-5 h-5 text-amber-500" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Premium Member</p>
                    <p className="text-xs text-muted-foreground">Enjoying ad-free experience</p>
                  </div>
                </div>
              ) : (
                <Button
                  onClick={async () => {
                    setUpgrading(true);
                    try {
                      const { data, error } = await supabase.functions.invoke('create-checkout', {
                        body: { returnUrl: window.location.origin },
                      });
                      if (error) throw error;
                      if (data?.url) window.location.href = data.url;
                    } catch (e: any) {
                      toast({ title: 'Error', description: e.message || 'Failed to start checkout', variant: 'destructive' });
                    } finally {
                      setUpgrading(false);
                    }
                  }}
                  disabled={upgrading}
                  className="w-full bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white"
                >
                  {upgrading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Crown className="w-4 h-4 mr-2" />}
                  {upgrading ? 'Redirecting...' : 'Upgrade to Premium — $4.99'}
                </Button>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button onClick={handleSave} disabled={loading} className="flex-1">
                <Save className="w-4 h-4 mr-2" />
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button variant="outline" onClick={handleSignOut} className="text-destructive border-destructive/30 hover:bg-destructive/10">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </motion.div>
      </div>

      <BottomNav />
    </div>
  );
};

export default Profile;
