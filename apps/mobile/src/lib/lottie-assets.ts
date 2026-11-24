export type LottieAnimationType = 'intro' | 'fill' | 'wire';
export type LottieColorMode = 'light' | 'dark';

export const LOTTIE_ASSETS: Record<LottieAnimationType, Record<LottieColorMode, any>> = {
  intro: {
    light: require('../../assets/lottie/revime_intro.json'),
    dark: require('../../assets/lottie/revime_intro_sombre.json'),
  },
  fill: {
    light: require('../../assets/lottie/revime_chargement_remplissage.json'),
    dark: require('../../assets/lottie/revime_chargement_remplissage_sombre.json'),
  },
  wire: {
    light: require('../../assets/lottie/revime_chargement_fil.json'),
    dark: require('../../assets/lottie/revime_chargement_fil_sombre.json'),
  },
};
