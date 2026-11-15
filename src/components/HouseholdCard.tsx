import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNutritionStore } from '../store/useNutritionStore';
import { colors, radius, spacing, type } from '../theme';
import type { HouseholdMember } from '../types';
import { ALLERGENS, DIETS, toggle } from './HealthProfileCard';
import { Button, Card, Chip, SectionTitle } from './ui';

/** Settings section: other people whose allergies and diets every scan is checked against. */
export function HouseholdCard() {
  const household = useNutritionStore(s => s.household);
  const addMember = useNutritionStore(s => s.addMember);
  const [newName, setNewName] = useState('');
  const [openId, setOpenId] = useState<string | undefined>();

  const add = () => {
    if (!newName.trim()) return;
    addMember(newName);
    setNewName('');
    // Open the new person's editor straight away.
    setTimeout(() => {
      const list = useNutritionStore.getState().household;
      setOpenId(list[list.length - 1]?.id);
    }, 0);
  };

  return (
    <Card>
      <SectionTitle>Household</SectionTitle>
      <Text style={[type.small, { marginBottom: spacing(3) }]}>
        Add the people you shop or cook for. Every scan shows whether it's safe for each of them.
      </Text>

      {household.map(m => (
        <MemberRow key={m.id} member={m} open={openId === m.id} onToggle={() => setOpenId(openId === m.id ? undefined : m.id)} />
      ))}

      <View style={styles.addRow}>
        <TextInput
          value={newName}
          onChangeText={setNewName}
          onSubmitEditing={add}
          placeholder="Name (e.g. Mia)"
          placeholderTextColor={colors.textMuted}
          returnKeyType="done"
          style={[styles.input, { flex: 1 }]}
        />
        <Button title="Add" variant="secondary" onPress={add} disabled={!newName.trim()} style={{ height: 44 }} />
      </View>
    </Card>
  );
}

function MemberRow({ member, open, onToggle }: { member: HouseholdMember; open: boolean; onToggle: () => void }) {
  const updateMember = useNutritionStore(s => s.updateMember);
  const removeMember = useNutritionStore(s => s.removeMember);
  const [avoidText, setAvoidText] = useState(member.avoidIngredients.join(', '));
  const summary = [...member.allergies, ...member.diets.map(d => DIETS.find(x => x.key === d)?.label ?? d)];

  return (
    <View style={styles.member}>
      <Pressable onPress={onToggle} style={styles.memberHeader} accessibilityRole="button">
        <View style={{ flex: 1 }}>
          <Text style={type.h3}>{member.name}</Text>
          <Text style={type.small} numberOfLines={1}>
            {summary.length ? summary.join(' · ') : 'Nothing set yet'}
          </Text>
        </View>
        <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
      </Pressable>

      {open && (
        <View style={{ paddingBottom: spacing(3) }}>
          <Text style={styles.heading}>Allergies</Text>
          <View style={styles.chips}>
            {ALLERGENS.map(a => (
              <Chip
                key={a}
                label={a}
                selected={member.allergies.includes(a)}
                onPress={() => updateMember(member.id, { allergies: toggle(member.allergies, a) })}
              />
            ))}
          </View>
          <Text style={styles.heading}>Diet</Text>
          <View style={styles.chips}>
            {DIETS.map(d => (
              <Chip
                key={d.key}
                label={d.label}
                selected={member.diets.includes(d.key)}
                onPress={() => updateMember(member.id, { diets: toggle(member.diets, d.key) })}
              />
            ))}
          </View>
          <Text style={styles.heading}>Ingredients {member.name} avoids</Text>
          <TextInput
            value={avoidText}
            onChangeText={setAvoidText}
            onBlur={() =>
              updateMember(member.id, {
                avoidIngredients: avoidText
                  .split(',')
                  .map(w => w.trim())
                  .filter(Boolean),
              })
            }
            placeholder="e.g. caffeine, red 40"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            style={styles.input}
          />
          <Pressable
            hitSlop={8}
            onPress={() =>
              Alert.alert(`Remove ${member.name}?`, undefined, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => removeMember(member.id) },
              ])
            }>
            <Text style={styles.remove}>Remove {member.name}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  member: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  memberHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing(3) },
  chevron: { fontSize: 18, color: colors.textMuted, paddingHorizontal: spacing(2) },
  heading: { ...type.h3, fontSize: 14, marginTop: spacing(2), marginBottom: spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing(3),
    fontSize: 15,
    color: colors.text,
  },
  remove: { color: colors.danger, fontWeight: '600', marginTop: spacing(3), fontSize: 13 },
  addRow: { flexDirection: 'row', gap: spacing(2), alignItems: 'center', marginTop: spacing(3) },
});
