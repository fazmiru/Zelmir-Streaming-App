
export const MOOD_CHIPS = ['Relax', 'Energise', 'Party', 'Focus', 'Sleep', 'Workout', 'Sad', 'Romance'] as const

export const MOOD_MIX_QUERIES: Record<string, { label: string; queries: string[] }> = {
  Relax: {
    label: 'FOR RELAXING',
    queries: ['chill lofi mix', 'relaxing ambient music', 'soft acoustic chill', 'peaceful piano calm'],
  },
  Energise: {
    label: 'FOR ENERGY',
    queries: [
      'english energetic pop hits 2024',
      'english upbeat electronic dance',
      'english high energy workout mix',
      'english motivational rock energy',
    ],
  },
  Party: {
    label: 'FOR THE PARTY',
    queries: [
      'english party anthems mix',
      'english dance club hits',
      'english hip hop party playlist',
      'english edm festival bangers',
    ],
  },
  Focus: {
    label: 'FOR FOCUS',
    queries: [
      'english focus study lofi',
      'english deep concentration music',
      'instrumental focus beats english',
      'english coding ambient focus',
    ],
  },
  Sleep: {
    label: 'FOR SLEEP',
    queries: [
      'english sleep ambient sounds',
      'english deep sleep music calm',
      'night rain soft piano english',
      'english dreamy atmospheric sleep',
    ],
  },
  Workout: {
    label: 'FOR WORKOUT',
    queries: [
      'english workout gym motivation',
      'english running high tempo',
      'english beast mode gym mix',
      'english cardio energy tracks',
    ],
  },
  Sad: {
    label: 'FOR WHEN IT HURTS',
    queries: [
      'english sad emotional songs',
      'english heartbreak ballads mix',
      'english melancholy indie sad',
      'english crying at night playlist',
    ],
  },
  Romance: {
    label: 'FOR ROMANCE',
    queries: [
      'english romantic love songs',
      'english r&b slow jams',
      'english intimate acoustic love',
      'english date night soft pop',
    ],
  },
}
