import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

vi.mock('../src/theme', () => ({
  useTheme: () => ({
    accent: { accent: '#E5122E', accentDeep: '#B00E24' },
    palette: { paper: '#fff', mist: '#f5f5f5', line: '#ddd', ink: '#111' },
    radii: { field: 14 },
    type: { body: { size: 16 } },
  }),
}));

import { Pressable } from 'react-native';
import { Button } from '../src/components/Button';

/**
 * V7 `FND7-075` / `ISS7-041`. The client, 2026-11-11: « quand on clique sur continuer tout le bouton
 * doit être cliquable pas que le milieu ».
 *
 * Reproduced on the Android emulator with APK `965635d2`: on the publish wizard only the label
 * « Continuer » answered a tap (x 444..636 of a 42..1038 button). uiautomator showed the button's
 * native view `enabled="false"` while the screen drew it enabled. Pressable's `disabled` becomes
 * `accessibilityState.disabled`, React Native's Android view manager turns that into
 * `View.setEnabled(false)`, and `TouchTargetHelper` treats a disabled view as `BOX_NONE`: the view
 * itself can no longer be hit, only its children (the label). Continuer mounts disabled on an empty
 * form; when it turned enabled, its native view stayed disabled. « Retour », never disabled, took
 * taps edge to edge.
 *
 * The fix does not depend on React Native getting that flip right: the Pressable is keyed on its
 * inert state, so a change mounts a fresh native view, built enabled or disabled from the start.
 */
function render(props: Partial<Parameters<typeof Button>[0]> = {}): ReactElement<{ disabled?: boolean }> {
  return Button({ label: 'Continuer', onPress: () => {}, ...props }) as ReactElement<{ disabled?: boolean }>;
}

describe('Button native view after disabled flips (FND7-075)', () => {
  it('renders a Pressable', () => {
    expect(render().type).toBe(Pressable);
  });

  it('gives the Pressable a different identity when it turns enabled, so Android rebuilds it', () => {
    const disabled = render({ disabled: true });
    const enabled = render({ disabled: false });
    expect(disabled.key).not.toBeNull();
    expect(enabled.key).not.toBeNull();
    expect(disabled.key).not.toBe(enabled.key);
  });

  it('treats loading like disabled, since both make the button inert', () => {
    expect(render({ loading: true }).key).toBe(render({ disabled: true }).key);
    expect(render({ loading: true }).props.disabled).toBe(true);
  });

  it('keeps the same identity while the state does not change, so a press is not lost to a remount', () => {
    expect(render({ disabled: false }).key).toBe(render().key);
  });
});
