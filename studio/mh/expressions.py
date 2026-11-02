"""VRM-Expression-Rezepte (Preset -> {Shape-Key: Gewicht}). Besitzer: Face-Abteilung. Namen = ARKit-Standard bzw. viseme_* (Oculus).
RECIPE = VRM-1.0-Presets (export_vrm.py), CUSTOM = zusätzliche Custom-Expressions (Lead hängt sie in den Export ein)."""
RECIPE = {
    'blink': {'eyeBlinkLeft': 1, 'eyeBlinkRight': 1}, 'blink_left': {'eyeBlinkLeft': 1}, 'blink_right': {'eyeBlinkRight': 1},
    'happy': {'mouthSmileLeft': .8, 'mouthSmileRight': .8, 'cheekSquintLeft': .5, 'cheekSquintRight': .5, 'eyeSquintLeft': .3, 'eyeSquintRight': .3,
              'mouthDimpleLeft': .2, 'mouthDimpleRight': .2, 'browInnerUp': .1},
    'angry': {'browDownLeft': .9, 'browDownRight': .9, 'noseSneerLeft': .3, 'noseSneerRight': .3, 'mouthFrownLeft': .35, 'mouthFrownRight': .35,
              'eyeSquintLeft': .4, 'eyeSquintRight': .4, 'mouthPressLeft': .4, 'mouthPressRight': .4},
    'sad': {'browInnerUp': .9, 'mouthFrownLeft': .65, 'mouthFrownRight': .65, 'mouthLowerDownLeft': .1, 'mouthLowerDownRight': .1,
            'eyeSquintLeft': .15, 'eyeSquintRight': .15, 'mouthShrugLower': .25},
    'relaxed': {'mouthSmileLeft': .3, 'mouthSmileRight': .3, 'eyeBlinkLeft': .25, 'eyeBlinkRight': .25, 'browInnerUp': .08},
    'surprised': {'eyeWideLeft': .9, 'eyeWideRight': .9, 'browInnerUp': .7, 'browOuterUpLeft': .6, 'browOuterUpRight': .6, 'jawOpen': .35, 'mouthFunnel': .15},
    'aa': {'viseme_aa': 1}, 'ih': {'viseme_I': 1}, 'ou': {'viseme_U': 1}, 'ee': {'viseme_E': 1}, 'oh': {'viseme_O': 1},
}
# Zusatz-Ausdrücke nach den Referenzblättern (Neutral, Curious, Happy, Excited, Thinking, Serious, Confused, Playful)
CUSTOM = {
    'curious': {'browInnerUp': .45, 'browOuterUpLeft': .55, 'eyeWideLeft': .25, 'eyeWideRight': .2, 'mouthSmileLeft': .2, 'mouthSmileRight': .15,
                'mouthPucker': .1},
    'excited': {'mouthSmileLeft': 1, 'mouthSmileRight': 1, 'jawOpen': .25, 'cheekSquintLeft': .45, 'cheekSquintRight': .45, 'eyeWideLeft': .3,
                'eyeWideRight': .3, 'browInnerUp': .35, 'browOuterUpLeft': .3, 'browOuterUpRight': .3, 'mouthUpperUpLeft': .2, 'mouthUpperUpRight': .2},
    'thinking': {'browDownLeft': .35, 'browInnerUp': .3, 'eyeSquintLeft': .25, 'eyeSquintRight': .1, 'eyeLookUpLeft': .35, 'eyeLookUpRight': .35,
                 'mouthPressLeft': .35, 'mouthPressRight': .2, 'mouthLeft': .3, 'mouthRollLower': .15},
    'serious': {'browDownLeft': .3, 'browDownRight': .3, 'eyeSquintLeft': .2, 'eyeSquintRight': .2, 'mouthPressLeft': .3, 'mouthPressRight': .3,
                'mouthClose': .05},
    'confused': {'browDownRight': .5, 'browOuterUpLeft': .55, 'browInnerUp': .2, 'eyeSquintRight': .3, 'mouthLeft': .25, 'mouthFrownRight': .25,
                 'mouthPucker': .15},
    'playful': {'mouthSmileLeft': .75, 'mouthSmileRight': .3, 'eyeBlinkLeft': .5, 'eyeSquintLeft': .3, 'cheekSquintLeft': .5, 'browOuterUpRight': .4,
                'mouthDimpleLeft': .3},
    'smirk': {'mouthSmileLeft': .6, 'mouthDimpleLeft': .3, 'cheekSquintLeft': .3, 'mouthPressRight': .2, 'eyeSquintLeft': .15, 'browDownRight': .1},
}
