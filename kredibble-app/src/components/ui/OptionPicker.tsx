import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Check, Plus, Search } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/design';
import { addReferenceListItem, fetchReferenceList, type ReferenceListKey } from '../../lib/api';

export type Option = { value: string; label?: string; detail?: string };

type OptionPickerProps = {
  visible: boolean;
  title: string;
  subtitle?: string;
  searchPlaceholder?: string;
  options: Option[];
  /** The chosen values. A single-select picker has at most one. */
  selected: string[];
  multi?: boolean;
  /** Called with the tapped value. A single-select picker closes itself afterwards. */
  onToggle: (value: string) => void;
  onClose: () => void;
  /**
   * Turns on the server-managed list: the live list is fetched when the picker opens (the `options` are the fallback), and a person who
   * cannot find their entry may add it. `noun` reads as "Add “x” as a new {noun}".
   */
  reference?: { key: ReferenceListKey; noun: string };
};

/**
 * A bottom sheet to pick one value or several from a long list, with search. For the server-managed lists (universities, programs, skills,
 * career interests) it also lets the person add what is missing; the server may suggest an entry that already exists, which they can use
 * or save their wording as an alias of.
 */
export function OptionPicker(props: OptionPickerProps) {
  // The sheet only exists while it is open, so its search text, notices and fetched list start fresh each time.
  return props.visible ? <PickerSheet {...props} /> : null;
}

function PickerSheet({ visible, title, subtitle, searchPlaceholder = 'Search', options, selected, multi, onToggle, onClose, reference }: OptionPickerProps) {
  const [query, setQuery] = useState('');
  const [live, setLive] = useState<string[] | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [similar, setSimilar] = useState<{ label: string; matches: string[] } | null>(null);

  const referenceKey = reference?.key;

  useEffect(() => {
    if (!referenceKey) return;
    let cancelled = false;
    fetchReferenceList('seeker', referenceKey)
      .then((result) => {
        if (!cancelled && Array.isArray(result.items)) setLive(result.items);
      })
      .catch(() => undefined); // keep showing the saved copy
    return () => {
      cancelled = true;
    };
  }, [referenceKey]);

  const all: Option[] = useMemo(() => {
    const base = live ? live.map((value) => ({ value })) : options;
    const known = new Set(base.map((option) => option.value.toLowerCase()));
    return [...base, ...added.filter((value) => !known.has(value.toLowerCase())).map((value) => ({ value }))];
  }, [live, options, added]);

  const q = query.trim().toLowerCase();
  const shown = q ? all.filter((option) => (option.label ?? option.value).toLowerCase().includes(q)) : all;
  const exact = all.some((option) => option.value.toLowerCase() === q);

  const choose = (value: string) => {
    onToggle(value);
    if (!multi) onClose();
  };

  const settle = (item: string, message: string) => {
    setAdded((previous) => (previous.includes(item) ? previous : [...previous, item]));
    setSimilar(null);
    setNotice(message);
    setQuery('');
    choose(item);
  };

  const addNew = async () => {
    if (!reference || q.length < 2) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const label = query.trim();
      const result = await addReferenceListItem('seeker', reference.key, label);
      if (result.action === 'similar') {
        setSimilar({ label, matches: result.matches });
        return;
      }
      settle(
        result.item,
        result.action === 'created'
          ? result.pending
            ? `"${result.item}" saved to your profile. Our team will review it before adding it to the list.`
            : `"${result.item}" added to the list.`
          : `Using "${result.item}".`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that entry. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const saveAlias = async (item: string) => {
    if (!reference || !similar) return;
    setBusy(true);
    setError('');
    try {
      const result = await addReferenceListItem('seeker', reference.key, similar.label, item);
      settle(result.action === 'similar' ? item : result.item, 'Saved. Everyone now sees the standard entry.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={onClose} accessibilityLabel="Close" />
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%', minHeight: '55%' }}>
        <View style={{ paddingHorizontal: 24, paddingTop: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }} className="font-sans">{title}</Text>
          {subtitle ? <Text style={{ fontSize: 13, color: '#8A8D9F', marginTop: 4 }} className="font-sans">{subtitle}</Text> : null}
          <View style={{ marginTop: 16, height: 48, borderWidth: 1, borderColor: '#EBEBEE', borderRadius: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Search size={16} color="#A1A1AA" />
            <TextInput
              testID="option-search"
              value={query}
              onChangeText={setQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor="#A1A1AA"
              autoCapitalize="none"
              style={{ flex: 1, fontSize: 14, color: '#1A1A1A' }}
              className="font-sans"
            />
          </View>
        </View>

        <FlatList
          data={shown}
          keyExtractor={(option) => option.value}
          keyboardShouldPersistTaps="handled"
          style={{ marginTop: 8 }}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 8 }}
          ListEmptyComponent={<Text style={{ paddingVertical: 20, fontSize: 13, color: '#8A8D9F' }} className="font-sans">No matches.</Text>}
          renderItem={({ item }) => {
            const active = selected.includes(item.value);
            return (
              <TouchableOpacity
                onPress={() => choose(item.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}
              >
                <Text style={{ fontSize: 14, color: active ? Colors.primary : '#1A1A1A', fontWeight: active ? '600' : '400', flex: 1 }} className="font-sans">{item.label ?? item.value}</Text>
                {item.detail ? <Text style={{ fontSize: 12, color: '#A1A1AA', marginRight: 8 }} className="font-sans">{item.detail}</Text> : null}
                {active ? <Check size={18} color={Colors.primary} /> : null}
              </TouchableOpacity>
            );
          }}
        />

        {reference && similar ? (
          <View style={{ paddingHorizontal: 24, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#EBEBEE', gap: 8 }}>
            <Text style={{ fontSize: 13, color: '#1A1A1A' }} className="font-sans">{`Did you mean one of these for “${similar.label}”?`}</Text>
            {similar.matches.map((match) => (
              <View key={match} style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => settle(match, `Using "${match}".`)} style={{ flex: 1, minHeight: 44, borderWidth: 1, borderColor: '#D8DAE0', borderRadius: 10, justifyContent: 'center', paddingHorizontal: 12 }}>
                  <Text style={{ fontSize: 13, color: '#1A1A1A' }} numberOfLines={2} className="font-sans">{match}</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={busy} onPress={() => saveAlias(match)} style={{ width: 76, minHeight: 44, borderRadius: 10, backgroundColor: Colors.primaryTransparent, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.primary }} className="font-sans">Same</Text>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity onPress={() => setSimilar(null)} style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
              <Text style={{ fontSize: 13, color: '#8A8D9F' }} className="font-sans">Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : reference && q.length >= 2 && !exact ? (
          <View style={{ paddingHorizontal: 24, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#EBEBEE' }}>
            <TouchableOpacity
              testID="option-add-new"
              disabled={busy}
              onPress={addNew}
              style={{ minHeight: 44, borderWidth: 1, borderColor: Colors.primary, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 }}
            >
              {busy ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <>
                  <Plus size={15} color={Colors.primary} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.primary }} className="font-sans">{`Add “${query.trim()}” as a new ${reference.noun}`}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : null}
        {notice ? <Text style={{ paddingHorizontal: 24, paddingBottom: 8, fontSize: 12, color: '#16A34A' }} className="font-sans">{notice}</Text> : null}
        {error ? <Text style={{ paddingHorizontal: 24, paddingBottom: 8, fontSize: 12, color: '#DC2626' }} className="font-sans">{error}</Text> : null}

        {multi ? (
          <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 }}>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" style={{ height: 52, borderRadius: 12, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#FFFFFF' }} className="font-sans">Done</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}
