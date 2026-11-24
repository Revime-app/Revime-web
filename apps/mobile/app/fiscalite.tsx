import { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme';
import { Card } from '../src/components/Card';
import { Field } from '../src/components/Field';
import { Button } from '../src/components/Button';
import { Checkbox } from '../src/components/Checkbox';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { ScreenMotif } from '../src/components/ScreenMotif';
import { IconLock } from '../src/icons';
import { useSessionContext } from '../src/lib/session';
import { useFiscalPreFill, useSubmitFiscalDeclaration } from '../src/lib/queries';
import { fiscalDeclarationInputSchema } from '@revime/shared';
import { RevimeLoader } from '../src/components/lottie/RevimeLoader';
import { KeyboardAvoider } from '../src/components/KeyboardAvoider';

function formatDateFr(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

/**
 * CMP-D1, CMP-D2. Screen for « Informations fiscales » (Déclaration annuelle DAC7).
 * Particuliers and pros declare tax residency and identifiers to comply with EU DAC7 regulation.
 */
export default function FiscaliteScreen() {
  const { palette, spacing } = useTheme();
  const router = useRouter();
  const { me, refresh } = useSessionContext();

  const { data: preFill, isLoading: isPreFillLoading } = useFiscalPreFill(Boolean(me));
  const submitMutation = useSubmitFiscalDeclaration();

  // Form state
  const [addressLine, setAddressLine] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('FR');

  const [nif, setNif] = useState('');
  const [hasNoNif, setHasNoNif] = useState(false);
  const [birthCity, setBirthCity] = useState('');
  const [birthCountry, setBirthCountry] = useState('France');

  const [customBirthDate, setCustomBirthDate] = useState('');
  const [attestation, setAttestation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed form when existing declaration is loaded
  useEffect(() => {
    if (preFill?.declaration) {
      setAddressLine(preFill.declaration.addressLine || '');
      setPostalCode(preFill.declaration.postalCode || '');
      setCity(preFill.declaration.city || '');
      setCountry(preFill.declaration.country || 'FR');
      setNif(preFill.declaration.nif || '');
      setHasNoNif(preFill.declaration.hasNoNif || false);
      setBirthCity(preFill.declaration.birthCity || '');
      setBirthCountry(preFill.declaration.birthCountry || 'France');
    }
  }, [preFill?.declaration]);

  if (!me) return null;

  const legalName =
    preFill?.legalName ||
    (me.firstName && me.lastName ? `${me.firstName} ${me.lastName}` : me.name);

  const isBirthDateLocked = Boolean(preFill?.isBirthDateLocked && preFill?.birthDate);
  const effectiveBirthDate = isBirthDateLocked ? preFill?.birthDate : customBirthDate;

  const handleSubmit = async () => {
    setError(null);

    // The date of birth is optional in the schema (a verified one is already on record and never
    // sent), so "required when not locked" is the screen's rule, repeated server-side.
    if (!isBirthDateLocked && !customBirthDate.trim()) {
      setError('Veuillez renseigner votre date de naissance (format AAAA-MM-JJ).');
      return;
    }

    // One rulebook: the same schema the API enforces, so the two cannot disagree on a message or a rule.
    const parsed = fiscalDeclarationInputSchema.safeParse({
      addressLine,
      postalCode,
      city,
      country,
      hasNoNif,
      nif: hasNoNif ? null : nif,
      birthCity: hasNoNif ? birthCity : null,
      birthCountry: hasNoNif ? birthCountry : null,
      birthDate: isBirthDateLocked ? null : customBirthDate.trim(),
      attestation,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Vérifiez les informations saisies.');
      return;
    }

    try {
      await submitMutation.mutateAsync(parsed.data);

      await refresh();
      router.replace('/statut-verification');
    } catch (err: any) {
      setError(
        err?.message || "Une erreur est survenue lors de l'enregistrement de vos informations fiscales.",
      );
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      <ScreenMotif v={3} variant="accent" />
      <ScreenHeader title="Informations fiscales" onBack={() => router.back()} />
      <KeyboardAvoider>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        {/* Context Card */}
        <Card style={{ marginBottom: spacing.md }}>
          <Text style={[styles.cardTitle, { color: palette.ink }]}>
            Déclaration fiscale annuelle (DAC7)
          </Text>
          <Text style={[styles.cardBody, { color: palette.muted, marginTop: spacing.xs }]}>
            Conformément à la directive européenne DAC7, les plateformes collaboratives sont tenues de collecter et déclarer chaque année les revenus perçus par leurs utilisateurs.
          </Text>
        </Card>

        {isPreFillLoading ? (
          <Card style={[styles.loadingCard, { marginBottom: spacing.md }]}>
            <RevimeLoader variant="fill" size={40} centered={false} text="Chargement de vos informations…" />
          </Card>
        ) : (
          <>
            {/* Section 1: Pre-filled Legal Identity */}
            <Card style={{ marginBottom: spacing.md }}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: palette.ink }]}>Identité légale</Text>
              </View>

              <View style={[styles.readOnlyRow, { borderBottomColor: palette.line }]}>
                <Text style={[styles.readOnlyLabel, { color: palette.muted }]}>Nom complet</Text>
                <View style={styles.readOnlyValueRow}>
                  <Text style={[styles.readOnlyValue, { color: palette.ink }]}>{legalName}</Text>
                  <IconLock size={15} color={palette.muted} />
                </View>
              </View>

              <View style={styles.readOnlyRow}>
                <Text style={[styles.readOnlyLabel, { color: palette.muted }]}>Date de naissance</Text>
                {isBirthDateLocked ? (
                  <View style={styles.readOnlyValueRow}>
                    <Text style={[styles.readOnlyValue, { color: palette.ink }]}>
                      {formatDateFr(effectiveBirthDate)}
                    </Text>
                    <IconLock size={15} color={palette.muted} />
                  </View>
                ) : (
                  <Field
                    label="Date de naissance"
                    placeholder="AAAA-MM-JJ (ex: 1990-05-15)"
                    value={customBirthDate}
                    onChangeText={setCustomBirthDate}
                    helperText="Requis pour la déclaration fiscale (18 ans ou plus)."
                  />
                )}
              </View>
            </Card>

            {/* Section 2: Address */}
            <Card style={{ marginBottom: spacing.md }}>
              <Text style={[styles.sectionTitle, { color: palette.ink, marginBottom: spacing.md }]}>
                Adresse principale de résidence fiscale
              </Text>

              <Field
                label="Adresse (numéro et voie)"
                placeholder="Ex : 12 rue de la Paix"
                value={addressLine}
                onChangeText={setAddressLine}
              />

              <Field
                label="Code postal"
                placeholder="Ex : 75002"
                keyboardType="numeric"
                maxLength={5}
                value={postalCode}
                onChangeText={setPostalCode}
              />

              <Field
                label="Ville"
                placeholder="Ex : Paris"
                value={city}
                onChangeText={setCity}
              />

              <Field
                label="Pays de résidence fiscale"
                value="France"
                editable={false}
              />
            </Card>

            {/* Section 3: Fiscal Identifier (NIF) */}
            <Card style={{ marginBottom: spacing.md }}>
              <Text style={[styles.sectionTitle, { color: palette.ink, marginBottom: spacing.xs }]}>
                Identifiant fiscal
              </Text>
              <Text style={[styles.cardBody, { color: palette.muted, marginBottom: spacing.md }]}>
                Votre numéro fiscal individuel figure sur votre avis d'imposition sur le revenu.
              </Text>

              {!hasNoNif && (
                <Field
                  label="Numéro fiscal (NIF)"
                  placeholder="Ex : 0123456789012"
                  keyboardType="numeric"
                  maxLength={13}
                  value={nif}
                  onChangeText={setNif}
                  helperText="13 chiffres commençant par 0, 1, 2 ou 3 (format DGFiP)"
                />
              )}

              <View style={{ marginVertical: spacing.xs }}>
                <Checkbox checked={hasNoNif} onPress={() => setHasNoNif(!hasNoNif)}>
                  <Text style={[styles.checkboxLabel, { color: palette.ink }]}>
                    Je n'ai pas de numéro fiscal
                  </Text>
                </Checkbox>
              </View>

              {hasNoNif && (
                <View style={{ marginTop: spacing.md }}>
                  <Text style={[styles.subNotice, { color: palette.muted, marginBottom: spacing.sm }]}>
                    En l'absence de numéro fiscal français, veuillez renseigner votre lieu de naissance :
                  </Text>
                  <Field
                    label="Ville de naissance"
                    placeholder="Ex : Lyon"
                    value={birthCity}
                    onChangeText={setBirthCity}
                  />
                  <Field
                    label="Pays de naissance"
                    placeholder="Ex : France"
                    value={birthCountry}
                    onChangeText={setBirthCountry}
                  />
                </View>
              )}
            </Card>

            {/* Statutory Attestation */}
            <Card style={{ marginBottom: spacing.md }}>
              <Checkbox checked={attestation} onPress={() => setAttestation(!attestation)}>
                <Text style={[styles.checkboxLabel, { color: palette.ink }]}>
                  J'atteste sur l'honneur l'exactitude des informations fournies conformément à la directive fiscale DAC7.
                </Text>
              </Checkbox>
            </Card>

            {/* Error Message */}
            {error && (
              <Card style={[styles.errorCard, { backgroundColor: palette.redSoft, marginBottom: spacing.md }]}>
                <Text style={[styles.errorText, { color: palette.redDeep }]}>{error}</Text>
              </Card>
            )}

            {/* Action Button */}
            <View style={{ marginTop: spacing.md }}>
              <Button
                label="Valider mes informations"
                onPress={handleSubmit}
                loading={submitMutation.isPending}
              />
            </View>
          </>
        )}
      </ScrollView>
      </KeyboardAvoider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  cardTitle: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 16, lineHeight: 22 },
  cardBody: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, lineHeight: 18 },
  loadingCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: 28 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15 },
  readOnlyRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'transparent' },
  readOnlyLabel: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12, marginBottom: 2 },
  readOnlyValueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  readOnlyValue: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 14 },
  checkboxLabel: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13.5, marginLeft: 8 },
  subNotice: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12.5, lineHeight: 17 },
  errorCard: { padding: 12, borderWidth: 1, borderColor: '#fca5a5' },
  errorText: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13, lineHeight: 18 },
});
