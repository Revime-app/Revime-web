import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  deriveDisputeTimeline,
  type CommandeDto,
} from '@revime/shared';
import { useTheme } from '../../theme';
import { Card } from '../Card';
import { Button } from '../Button';
import { IconWrench, IconPadlock } from '../../icons';
import { DisputeBranchConnector } from './DisputeBranchConnector';

type Props = {
  data: CommandeDto;
};

export function CommandeTimelineCard({ data }: Props) {
  const router = useRouter();
  const { palette, spacing } = useTheme();
  const step = data.step;
  if (step === null) return null;

  const timeline = deriveDisputeTimeline(data);

  if (!timeline.hasDispute) {
    return (
      <Card style={{ marginBottom: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg }}>
          <IconWrench size={20} color={palette.ink} strokeWidth={1.8} />
          <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, color: palette.ink }}>
            Suivi de la commande
          </Text>
        </View>

        <View style={{ position: 'relative', paddingLeft: 28 }}>
          {timeline.mainSteps.map((row, idx) => {
            const isLast = idx === timeline.mainSteps.length - 1;
            const dotColor =
              row.state === 'done'
                ? palette.green
                : row.state === 'current'
                  ? '#f79009'
                  : palette.line;
            const labelColor = row.state === 'current' ? '#f79009' : palette.ink;

            return (
              <View key={row.key} style={{ position: 'relative', paddingBottom: isLast ? 0 : 22 }}>
                <View
                  style={{
                    position: 'absolute',
                    left: -28,
                    top: 0,
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: dotColor,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {row.state === 'done' && (
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓</Text>
                  )}
                </View>

                {!isLast && (
                  <View
                    style={{
                      position: 'absolute',
                      left: -20,
                      top: 18,
                      bottom: -4,
                      width: 2,
                      backgroundColor: row.state === 'done' ? palette.green : palette.line,
                    }}
                  />
                )}

                <Text
                  style={{
                    fontFamily: 'GoogleSansFlex_700Bold',
                    fontSize: 13.5,
                    color: labelColor,
                    opacity: row.state === 'future' ? 0.45 : 1,
                  }}
                >
                  {row.label}
                </Text>
                {row.sub && (
                  <Text
                    style={{
                      fontFamily: 'GoogleSansFlex_400Regular',
                      fontSize: 12,
                      color: palette.muted,
                      marginTop: 2,
                      opacity: row.state === 'future' ? 0.7 : 1,
                    }}
                  >
                    {row.sub}
                  </Text>
                )}
                {row.date && (
                  <Text
                    style={{
                      fontFamily: 'GoogleSansFlex_400Regular',
                      fontSize: 12,
                      color: palette.muted,
                      marginTop: 2,
                    }}
                  >
                    {row.date}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      </Card>
    );
  }

  // Dispute is present (open or resolved): render two-track timeline
  const branchColor =
    timeline.branchColor || (timeline.disputeState === 'OPEN' ? palette.redDeep : palette.ink);

  const suspendedStepKey = timeline.suspendedStep;
  const suspendedIndex = timeline.mainSteps.findIndex(
    (s) => s.state === 'suspended' || (suspendedStepKey && s.key === suspendedStepKey)
  );
  const splitIndex = suspendedIndex >= 0 ? suspendedIndex : 0;

  const preSteps = timeline.mainSteps.slice(0, splitIndex);
  const splitSteps = timeline.mainSteps.slice(splitIndex);

  const lockNotice = timeline.reference
    ? `Les échanges concernant le litige ${timeline.reference} sont privés avec REVIME.`
    : 'Les échanges concernant ce litige sont privés avec REVIME.';

  return (
    <Card style={{ marginBottom: spacing.md }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: spacing.lg,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <IconWrench size={20} color={palette.ink} strokeWidth={1.8} />
          <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, color: palette.ink }}>
            Suivi de la commande
          </Text>
        </View>

        {timeline.headerBadge && (
          <View
            style={
              timeline.headerBadge.variant === 'solid'
                ? {
                    backgroundColor: palette.redDeep,
                    paddingHorizontal: 12,
                    paddingVertical: 5,
                    borderRadius: 9999,
                  }
                : {
                    borderWidth: 1,
                    borderColor: palette.ink,
                    paddingHorizontal: 12,
                    paddingVertical: 5,
                    borderRadius: 9999,
                  }
            }
          >
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_700Bold',
                fontSize: 12,
                color: timeline.headerBadge.variant === 'solid' ? '#ffffff' : palette.ink,
              }}
            >
              {timeline.headerBadge.label}
            </Text>
          </View>
        )}
      </View>

      {/* Main track steps before the suspended branch */}
      {preSteps.length > 0 && (
        <View style={{ position: 'relative' }}>
          {preSteps.map((row) => (
            <View
              key={row.key}
              style={{
                position: 'relative',
                paddingLeft: 28,
                paddingBottom: 22,
              }}
            >
              <View
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: palette.green,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓</Text>
              </View>

              <View
                style={{
                  position: 'absolute',
                  left: 8,
                  top: 18,
                  bottom: -4,
                  width: 2,
                  backgroundColor: palette.green,
                }}
              />

              <Text
                style={{
                  fontFamily: 'GoogleSansFlex_700Bold',
                  fontSize: 13.5,
                  color: palette.ink,
                }}
              >
                {row.label}
              </Text>
              {row.sub && (
                <Text
                  style={{
                    fontFamily: 'GoogleSansFlex_400Regular',
                    fontSize: 12,
                    color: palette.muted,
                    marginTop: 2,
                  }}
                >
                  {row.sub}
                </Text>
              )}
              {row.date && (
                <Text
                  style={{
                    fontFamily: 'GoogleSansFlex_400Regular',
                    fontSize: 12,
                    color: palette.muted,
                    marginTop: 2,
                  }}
                >
                  {row.date}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Two-track layout starting at the suspended step */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        {/* Left Track: suspended and subsequent main steps */}
        <View style={{ flex: 1.15 }}>
          {splitSteps.map((row, idx) => {
            const isLast = splitIndex + idx === timeline.mainSteps.length - 1;
            return (
              <View
                key={row.key}
                style={{
                  position: 'relative',
                  paddingLeft: 28,
                  paddingBottom: isLast ? 0 : 22,
                }}
              >
                {/* Dot indicator */}
                {row.state === 'suspended' ? (
                  <View
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      borderWidth: 2,
                      borderColor: palette.redDeep,
                      backgroundColor: '#ffffff',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        gap: 2,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <View
                        style={{
                          width: 2,
                          height: 7,
                          backgroundColor: palette.redDeep,
                          borderRadius: 1,
                        }}
                      />
                      <View
                        style={{
                          width: 2,
                          height: 7,
                          backgroundColor: palette.redDeep,
                          borderRadius: 1,
                        }}
                      />
                    </View>
                  </View>
                ) : row.state === 'closed' ? (
                  <View
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      backgroundColor: palette.line,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '700' }}>✕</Text>
                  </View>
                ) : row.state === 'current' ? (
                  row.sub?.includes('Reprise') ? (
                    <View
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        borderWidth: 2,
                        borderColor: palette.ink,
                        backgroundColor: '#ffffff',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <View
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: palette.ink,
                        }}
                      />
                    </View>
                  ) : (
                    <View
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        backgroundColor: '#f79009',
                      }}
                    />
                  )
                ) : row.state === 'done' ? (
                  <View
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      backgroundColor: palette.green,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓</Text>
                  </View>
                ) : (
                  <View
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      borderWidth: 1.8,
                      borderColor: palette.line,
                      backgroundColor: '#ffffff',
                    }}
                  />
                )}

                {/* Connecting line to next main step */}
                {!isLast && (
                  <View
                    style={{
                      position: 'absolute',
                      left: 8,
                      top: 18,
                      bottom: -4,
                      width: 2,
                      backgroundColor: row.state === 'done' ? palette.green : palette.line,
                    }}
                  />
                )}

                {/* Main step labels */}
                <Text
                  style={{
                    fontFamily: 'GoogleSansFlex_700Bold',
                    fontSize: 13.5,
                    color: row.state === 'current' ? '#f79009' : palette.ink,
                    opacity: row.state === 'future' ? 0.45 : 1,
                  }}
                >
                  {row.label}
                </Text>
                {row.sub && (
                  <Text
                    style={{
                      fontFamily:
                        row.state === 'suspended'
                          ? 'GoogleSansFlex_500Medium'
                          : 'GoogleSansFlex_400Regular',
                      fontSize: 12,
                      color: row.state === 'suspended' ? palette.redDeep : palette.muted,
                      marginTop: 2,
                      opacity: row.state === 'future' ? 0.7 : 1,
                    }}
                  >
                    {row.sub}
                  </Text>
                )}
                {row.date && (
                  <Text
                    style={{
                      fontFamily: 'GoogleSansFlex_400Regular',
                      fontSize: 12,
                      color: palette.muted,
                      marginTop: 2,
                    }}
                  >
                    {row.date}
                  </Text>
                )}
              </View>
            );
          })}
        </View>

        {/* Right Track: lateral dispute branch */}
        <View style={{ flex: 0.95 }}>
          {/* Connector curve from suspended step */}
          <View style={{ height: 30, position: 'relative' }}>
            <View style={{ position: 'absolute', left: -8, top: 0 }}>
              <DisputeBranchConnector color={branchColor} width={36} height={30} />
            </View>
          </View>

          {/* Branch steps */}
          {timeline.branchSteps.map((bStep, bIdx) => {
            const isLast = bIdx === timeline.branchSteps.length - 1;
            return (
              <View
                key={bStep.key}
                style={{
                  position: 'relative',
                  paddingLeft: 45,
                  paddingBottom: isLast ? 0 : 22,
                }}
              >
                {/* Branch dot */}
                {bStep.state === 'done' ? (
                  <View
                    style={{
                      position: 'absolute',
                      left: 19,
                      top: 0,
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      backgroundColor: branchColor,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓</Text>
                  </View>
                ) : bStep.state === 'active' ? (
                  <View
                    style={{
                      position: 'absolute',
                      left: 19,
                      top: 0,
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      borderWidth: 2,
                      borderColor: branchColor,
                      backgroundColor: '#ffffff',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: branchColor,
                      }}
                    />
                  </View>
                ) : (
                  <View
                    style={{
                      position: 'absolute',
                      left: 19,
                      top: 0,
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      borderWidth: 1.8,
                      borderColor: palette.line,
                      backgroundColor: '#ffffff',
                    }}
                  />
                )}

                {/* Connecting line to next branch step */}
                {!isLast && (
                  <View
                    style={{
                      position: 'absolute',
                      left: 27,
                      top: 18,
                      bottom: -4,
                      width: 2,
                      backgroundColor: bStep.state === 'done' ? branchColor : palette.line,
                    }}
                  />
                )}

                {/* Branch labels */}
                <Text
                  style={{
                    fontFamily: 'GoogleSansFlex_700Bold',
                    fontSize: 13.5,
                    color: bStep.state === 'active' ? branchColor : palette.ink,
                    opacity: bStep.state === 'future' ? 0.45 : 1,
                  }}
                >
                  {bStep.label}
                </Text>
                {bStep.sub && (
                  <Text
                    style={{
                      fontFamily: 'GoogleSansFlex_400Regular',
                      fontSize: 12,
                      color: palette.muted,
                      marginTop: 2,
                      opacity: bStep.state === 'future' ? 0.7 : 1,
                    }}
                  >
                    {bStep.sub}
                  </Text>
                )}
                {bStep.date && (
                  <Text
                    style={{
                      fontFamily: 'GoogleSansFlex_400Regular',
                      fontSize: 12,
                      color: palette.muted,
                      marginTop: 2,
                    }}
                  >
                    {bStep.date}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      </View>

      {/* Footer: lock notice and dispute details button */}
      <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
            backgroundColor: palette.mist,
            borderRadius: 8,
            padding: spacing.sm,
          }}
        >
          <IconPadlock size={15} color={palette.muted} strokeWidth={1.8} />
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: 12,
              lineHeight: 16,
              color: palette.muted,
              flex: 1,
            }}
          >
            {lockNotice}
          </Text>
        </View>

        <Button
          label="Voir les détails du litige"
          variant="secondary"
          onPress={() => router.push(`/commande/${data.id}/litige`)}
        />
      </View>
    </Card>
  );
}
