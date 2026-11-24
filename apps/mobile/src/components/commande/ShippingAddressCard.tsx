import { useState } from 'react';
import { Text } from 'react-native';
import type { CommandeDto, ParcelPointInput } from '@revime/shared';
import { useTheme } from '../../theme';
import { Card } from '../Card';
import { Field } from '../Field';
import { Button } from '../Button';
import { RelayPointPicker } from '../RelayPointPicker';
import { useSubmitShippingAddress } from '../../lib/queries';
import { ApiError } from '../../lib/api';

type Props = {
  commandeId: string;
  data: CommandeDto;
  /** Livraison Boxtal (spec §9.2): the server's flag gates every Boxtal surface. */
  quoting: boolean;
};

/**
 * « Adresse d'expédition » form, unchanged from `commande/[id].tsx` (extraction only -
 * Task 5 commit 1). Renders only while `parcelStage(data) === 'AWAITING_YOUR_ADDRESS'` -
 * the caller decides that, this component owns the form itself.
 */
export function ShippingAddressCard({ commandeId, data, quoting }: Props) {
  const { palette, spacing } = useTheme();
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [parcelPoint, setParcelPoint] = useState<ParcelPointInput | null>(null);
  const submitAddress = useSubmitShippingAddress(commandeId);

  return (
    <Card style={{ marginBottom: spacing.md }}>
      <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, color: palette.ink }}>
        Adresse d'expédition
      </Text>
      <Text
        style={{
          fontFamily: 'GoogleSansFlex_400Regular',
          fontSize: 13,
          color: palette.muted,
          marginTop: 4,
          marginBottom: spacing.md,
        }}
      >
        Pour recevoir votre étiquette prépayée, indiquez l'adresse d'expédition.
      </Text>
      <Field label="Adresse" value={line1} onChangeText={setLine1} error={fields.line1} />
      <Field
        label="Complément (optionnel)"
        value={line2}
        onChangeText={setLine2}
        error={fields.line2}
      />
      <Field
        label="Code postal"
        value={postalCode}
        onChangeText={setPostalCode}
        keyboardType="number-pad"
        error={fields.postalCode}
      />
      <Field label="Ville" value={city} onChangeText={setCity} error={fields.city} />
      <Field
        label="Téléphone"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        error={fields.phone}
      />
      <Text
        style={{
          fontFamily: 'GoogleSansFlex_400Regular',
          fontSize: 12,
          color: palette.muted,
          marginTop: -spacing.md,
          marginBottom: spacing.md,
        }}
      >
        {quoting
          ? 'Mobile obligatoire : le transporteur envoie les avis de passage par SMS.'
          : 'Mobile de préférence, pour les avis de passage.'}
      </Text>
      {/* Livraison Boxtal (spec §9.2): under RELAY the party who COLLECTS this leg chooses where. */}
      {quoting && data.parcelOption === 'RELAY' && (
        <RelayPointPicker
          commandeId={commandeId}
          postalCode={postalCode}
          city={city}
          value={parcelPoint}
          onChange={setParcelPoint}
        />
      )}
      <Button
        label="Enregistrer l'adresse"
        onPress={() => {
          setFields({});
          setFormError(null);
          submitAddress.mutate(
            {
              line1,
              line2: line2.trim() === '' ? undefined : line2,
              postalCode,
              city,
              phone,
              parcelPoint: parcelPoint ?? undefined,
            },
            {
              onError: (e) => {
                if (e instanceof ApiError) {
                  setFields(e.fields ?? {});
                  // Any error without field detail must still be readable, or
                  // the button looks dead.
                  if (!e.fields) setFormError(e.message);
                } else {
                  setFormError('Une erreur est survenue. Réessayez.');
                }
              },
            },
          );
        }}
        disabled={submitAddress.isPending || (quoting && data.parcelOption === 'RELAY' && !parcelPoint)}
        loading={submitAddress.isPending}
      />
      {formError && (
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_500Medium',
            fontSize: 13,
            color: palette.red,
            marginTop: spacing.md,
          }}
        >
          {formError}
        </Text>
      )}
    </Card>
  );
}
