# MedBuddy

### AI-Powered Medical Companion Mobile Application

> A Flutter-based mobile health companion designed for elderly patients and their caregivers. MedBuddy combines real-time AI conversation, proactive wellness monitoring, fall detection with two-factor liveness verification, and an emergency escalation chain — all in a single role-based application built for accessibility and safety.

-----

## Table of Contents

1. [Overview](#overview)
1. [Core Features](#core-features)
1. [Tech Stack](#tech-stack)
1. [Architecture](#architecture)
1. [Communication Layer](#communication-layer)
1. [User Roles](#user-roles)
1. [Screen Inventory](#screen-inventory)
1. [Emergency Escalation Chain](#emergency-escalation-chain)
1. [Design System](#design-system)
1. [Project Structure](#project-structure)
1. [Getting Started](#getting-started)
1. [Backend Integration](#backend-integration)
1. [Roadmap](#roadmap)

-----

## Overview

MedBuddy is a mobile application serving two distinct user roles — **Patient** and **Caregiver** — from a single codebase. The role is selected at registration and determines the entire app experience from that point forward.

The application is designed specifically for elderly patients living with chronic conditions such as diabetes, hypertension, heart disease, and Alzheimer’s. Every design decision — from minimum touch target sizes to semantic color usage — prioritizes accessibility, legibility, and calm under pressure.

The core safety loop works as follows:

1. The AI buddy conducts daily wellness check-ins and monitors medication adherence
1. The device accelerometer continuously monitors for falls in the background
1. If a fall is detected or the patient triggers SOS manually, a two-factor liveness verification begins
1. If verification fails, a real-time audio channel opens directly to the caregiver’s device
1. If the caregiver cannot be reached, the system falls back to SMS and then to 911

-----

## Core Features

### Phase 1 — MVP

- **Patient profile setup** — structured onboarding covering health conditions, medications, mobility level, cognitive state, emergency contacts, and check-in preferences. All data feeds into fall detection sensitivity, AI response style, and emergency behavior
- **Medication reminders** — push notifications, on-device TTS read-aloud, conversational AI follow-up, and escalation SMS if unacknowledged within a configurable grace period
- **Appointment reminders** — 24-hour and 1-hour reminders per appointment
- **Manual SOS button** — persistent across all screens, requires a 3-second hold-to-confirm to prevent accidental triggers. Sends SMS, shares GPS, and activates native 911

### Phase 2 — Voice & Check-ins

- **Full voice interaction** — STT via OpenAI Whisper converts speech to text across all screens. TTS via ElevenLabs renders AI responses in a warm natural voice
- **AI wellness check-ins** — proactive daily check-ins covering mood, energy, pain level (compared against the patient’s baseline), sleep quality, and medication confirmation
- **Emergency response flow** — structured multi-step response triggered by SOS or automated detection, using Agora SDK for real-time audio instead of VoIP

### Phase 3 — Fall Detection

- **On-device fall detection** — continuous background monitoring via device accelerometer and gyroscope using the `sensors_plus` Flutter plugin
- **10-second cancellation window** — false positives can be dismissed silently before verification begins
- **Two-factor liveness verification** — inspired by 2FA authentication principles:
  - **Factor 1** — named response: TTS asks the patient to say their full name. STT matches against the registered name in the profile
  - **Factor 1.5** — grace retry: a second prompt with a 5-second pause covers disoriented or STT misfire cases
  - **Factor 2** — Agora audio channel: both factors fail → Agora opens a real-time two-way audio channel to the caregiver instantly
- **Cognitive impairment adjustment** — for users flagged with cognitive impairment, strict name-match is replaced with detection of any coherent verbal response

### Phase 4 — Caregiver Mobile

- **Role-based experience** — the caregiver sees a completely different home screen and navigation from the patient
- **Patient linking** — invite code system where the patient generates a 6-digit code or shareable link. The caregiver enters it and the patient approves or denies access
- **Live patient list** — real-time status dots (green / amber / red) with active emergencies auto-sorted to top
- **Remote medication management** — full edit access to patient’s medication schedule. All changes notify the patient in real time
- **Emergency active screen** — opens automatically via FCM push when liveness verification fails. Agora channel is live instantly — no tap required on the caregiver side
- **Health history and AI insights** — full access to wellness timelines, AI-flagged patterns, adherence heatmaps, and emergency event logs
- **Caregiver-patient messaging** — text and voice messages (via Agora) in a shared conversation thread. Health reports shareable directly into chat

### Phase 5 — Symptom & Visit Logs

- **Daily symptom log** — voice or text entries in a chronological timeline. AI highlights flagged and watch-level entries
- **Doctor visit voice summaries** — patient speaks freely after an appointment. Whisper transcribes it and AI produces a structured note with diagnosis, medications changed, instructions, and next appointment

### Phase 6 — Wearable

- **Apple Watch companion** — fall detection via wrist accelerometer, liveness verification via watch speaker/mic, escalation handoff to iPhone. Medication reminders as haptic taps. HealthKit integration for heart rate, activity, and sleep data

-----

## Tech Stack

|Layer             |Technology                                          |
|------------------|----------------------------------------------------|
|Mobile framework  |Flutter (Dart)                                      |
|AI language model |Qwen 2.5 7B (via backend API)                       |
|Speech-to-text    |OpenAI Whisper / Faster-Whisper Large-v3 Turbo      |
|Text-to-speech    |ElevenLabs / Coqui XTTS-v2                          |
|Real-time audio   |Agora SDK (Flutter SDK, free tier: 10,000 min/month)|
|Push notifications|Firebase Cloud Messaging (FCM)                      |
|SMS fallback      |Twilio SMS                                          |
|Emergency calls   |Native Emergency SOS (platform-managed)             |
|Backend API       |FastAPI (Python)                                    |
|RAG pipeline      |FAISS + LangGraph                                   |
|Emotion fusion    |HuBERT + CAMeL-BERT                                 |
|Motion sensing    |`sensors_plus` Flutter plugin                       |
|Wearable (Phase 6)|watchOS + HealthKit                                 |

-----

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Flutter Mobile App                    │
│                                                         │
│  ┌──────────────┐              ┌──────────────────────┐ │
│  │ Patient Role │              │   Caregiver Role     │ │
│  │  S-01→S-29   │              │   C-01→C-11          │ │
│  └──────┬───────┘              └──────────┬───────────┘ │
│         │                                │              │
│  ┌──────▼──────────────────────────────▼───────────┐   │
│  │              Shared Service Layer                │   │
│  │  AIService │ STTService │ TTSService │ Agora     │   │
│  │  EmergencyService │ MedicationService            │   │
│  └──────────────────────┬───────────────────────────┘   │
└─────────────────────────│───────────────────────────────┘
                          │
          ┌───────────────▼────────────────┐
          │         FastAPI Backend         │
          │                                │
          │  ┌─────────┐  ┌─────────────┐ │
          │  │ Qwen 2.5│  │Faster-Whisper│ │
          │  │   7B    │  │  Large-v3   │ │
          │  └─────────┘  └─────────────┘ │
          │                                │
          │  ┌─────────┐  ┌─────────────┐ │
          │  │  FAISS  │  │ HuBERT +   │ │
          │  │   RAG   │  │ CAMeL-BERT │ │
          │  └─────────┘  └─────────────┘ │
          └────────────────────────────────┘
                          │
          ┌───────────────▼────────────────┐
          │       External Services         │
          │  Agora SDK │ Twilio │ FCM      │
          └────────────────────────────────┘
```

-----

## Communication Layer

### Agora SDK — Primary Real-Time Audio

All real-time audio between patient and caregiver is delivered through the Agora SDK. Agora was chosen because it:

- Is free up to 10,000 minutes/month — sufficient for MVP and testing
- Has a production-ready Flutter SDK
- Supports background audio on both iOS and Android natively
- Can wake a locked device via FCM push notification without any user interaction

**Two use cases:**

1. **Emergency channel** — opens automatically when fall liveness verification fails. Both patient speaker and caregiver mic/speaker go live instantly. No tap required on either side
1. **Voice messages in chat** — the same Agora infrastructure powers voice note recording and playback in the caregiver-patient chat thread

### Twilio SMS — Fallback Only

Twilio SMS is a fallback for when the caregiver’s device cannot be reached via Agora:

- SMS sent to emergency contact when Agora channel fails to connect within 30 seconds
- SMS used for medication escalation notifications
- Final confirmation SMS after 911 activation — sent regardless of channel status

-----

## User Roles

### Patient Role (S-01 to S-29)

The primary user — typically an elderly person living with one or more chronic conditions. The patient-facing UI is designed for maximum accessibility: large touch targets (minimum 56dp), large text (minimum 16sp), warm color palette, and voice as the primary input method throughout the app.

Key patient capabilities:

- Complete profile setup covering health, mobility, cognitive state, medications, and emergency contacts
- Daily AI wellness check-ins via voice or text
- Medication schedule management with reminders
- Appointment tracking
- Manual SOS with 3-second hold confirmation
- Fall detection with two-factor liveness verification
- Full health history — wellness charts, medication adherence heatmap, emergency event log
- Caregiver invite and access management
- Doctor visit voice summaries and symptom logging

### Caregiver Role (C-01 to C-11)

A family member, nurse, or care professional linked to one or more patients. The caregiver sees an entirely different home screen and navigation after login. One caregiver can be linked to multiple patients.

Key caregiver capabilities:

- Live patient list with real-time status dots
- Automated FCM-triggered emergency screen that wakes from locked screen
- Remote medication and appointment management
- Trigger on-demand wellness check-ins for any patient
- Full health history access with AI-generated pattern insights
- Caregiver-patient messaging with health report sharing
- Post-emergency outcome logging

-----

## Screen Inventory

### Patient Screens (29 screens)

|Screen|Name                                      |Phase|
|------|------------------------------------------|-----|
|S-01  |Welcome & Language Selection              |1    |
|S-02  |Role Selection                            |1    |
|S-03  |Login / Register                          |1    |
|S-04  |Profile Setup — Basic Info                |1    |
|S-05  |Profile Setup — Health Conditions         |1    |
|S-06  |Profile Setup — Mobility & Cognitive State|1    |
|S-07  |Profile Setup — Medications               |1    |
|S-08  |Profile Setup — Emergency Contacts        |1    |
|S-09  |Profile Setup — Check-in Preferences      |1    |
|S-10  |Profile Setup — Review & Confirm          |1    |
|S-11  |Home Dashboard                            |1    |
|S-12  |SOS Confirmation Overlay                  |1    |
|S-13  |Medication Schedule                       |1    |
|S-14  |Add / Edit Medication                     |1    |
|S-15  |Appointment Reminders                     |1    |
|S-16  |Reminder Notification — Active State      |1    |
|S-17  |AI Buddy Chat                             |2    |
|S-17b |Wellness Check-in — Active                |2    |
|S-18  |SOS Active                                |2    |
|S-19  |Fall Detected — Cancellation Window       |3    |
|S-20  |Fall Verification — Factor 1              |3    |
|S-21  |Fall Verification — Factor 2 (Agora)      |3    |
|S-22  |Wellness History                          |2    |
|S-23  |Medication Adherence History              |2    |
|S-24  |Emergency Event Log                       |2    |
|S-25  |My Profile                                |1    |
|S-26  |Patient Chat (with Caregiver)             |4    |
|S-27  |App Settings                              |1    |
|S-28  |Symptom Log                               |5    |
|S-29  |Visit Summary Recorder                    |5    |

### Caregiver Screens (11 screens)

|Screen|Name                                |Phase|
|------|------------------------------------|-----|
|C-01  |Caregiver Home — Patient List       |4    |
|C-02  |Add Patient — Invite Code Entry     |4    |
|C-03  |Combined Alerts Feed                |4    |
|C-04  |Patient Dashboard                   |4    |
|C-05  |Patient Medications (Caregiver Edit)|4    |
|C-06  |Patient Health History              |4    |
|C-07  |Emergency Active Screen             |4    |
|C-08  |Caregiver Chat (with Patient)       |4    |
|C-09  |Caregiver Profile & Linked Patients |4    |
|C-10  |Pending Link Approval (Patient Side)|4    |
|C-11  |Caregiver Settings                  |4    |

**Total: 40 screens across 2 roles**

-----

## Emergency Escalation Chain

The full escalation chain for both manual SOS and fall detection:

```
User triggers SOS manually
        OR
Device detects a fall
        │
        ▼
┌─────────────────────────────┐
│  10-second cancellation     │ ──── User cancels ──── END
│  window (fall only)         │
└──────────────┬──────────────┘
               │ No cancel
               ▼
┌─────────────────────────────┐
│  Factor 1 — Name match      │
│  TTS: "Say your full name"  │
│  STT matches profile name   │
└──────────────┬──────────────┘
               │ No match / no response
               ▼
┌─────────────────────────────┐
│  Factor 1.5 — Grace retry   │
│  5-second pause, 2nd prompt │
└──────────────┬──────────────┘
               │ Still fails
               ▼
┌─────────────────────────────┐
│  Factor 2 — Agora channel   │
│  FCM wakes caregiver app    │
│  Audio live on both sides   │
│  Loud alarm on patient      │
└──────────────┬──────────────┘
               │ Agora fails within 30s
               ▼
┌─────────────────────────────┐
│  Fallback — Twilio SMS      │
│  + automated voice call     │
│  to caregiver phone         │
└──────────────┬──────────────┘
               │ No answer after 30s
               ▼
┌─────────────────────────────┐
│  Native Emergency SOS       │
│  Dials 911                  │
│  Shares GPS coordinates     │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│  Final confirmation SMS     │
│  Sent regardless of status  │
│  Includes last known GPS    │
└─────────────────────────────┘
```

-----

## Design System

### Color Palette

The color system is built around two principles: maximum legibility for elderly users and instant recognition in emergency situations. Every color carries a single unambiguous meaning.

|Role          |Color     |Hex      |Usage                         |
|--------------|----------|---------|------------------------------|
|App background|Warm White|`#FAFAF9`|All screen backgrounds        |
|Primary       |Teal      |`#0D9488`|Buttons, links, AI bubbles    |
|Primary Dark  |Dark Teal |`#0F766E`|Headers, active nav           |
|Primary Light |Light Teal|`#99F6E4`|Chips, tags                   |
|Primary Soft  |Soft Teal |`#F0FDFA`|Card backgrounds              |
|Emergency     |Red       |`#DC2626`|SOS screens, fall verification|
|Warning       |Amber     |`#D97706`|Missed meds, overdue check-ins|
|Success       |Green     |`#16A34A`|Taken meds, confirmed states  |
|Body text     |Slate 700 |`#334155`|All readable body content     |
|Primary text  |Slate 900 |`#0F172A`|Headings and labels           |
|Secondary text|Slate 500 |`#64748B`|Timestamps, helper text       |
|Dividers      |Slate 300 |`#CBD5E1`|List separators               |
|Input fields  |Slate 100 |`#F1F5F9`|Text field backgrounds        |

**Rules:**

- Red is **never** used for anything except emergency states
- Green is **never** used for anything except success/safe states
- All text on background combinations meet WCAG AA minimum (4.5:1 contrast ratio)
- No gradients on functional elements — buttons, badges, and status indicators use flat colors

### Typography

|Style    |Size   |Weight  |Usage                         |
|---------|-------|--------|------------------------------|
|Heading 1|24sp   |Bold    |Patient name, screen titles   |
|Heading 2|20sp   |Bold    |Section titles                |
|Heading 3|17sp   |Bold    |App bar titles                |
|Body     |16sp   |Regular |All readable content (minimum)|
|Body Bold|16sp   |SemiBold|Medication names, card titles |
|Secondary|14sp   |Regular |Supporting information        |
|Label    |13sp   |Regular |Chips, badges, helper text    |
|Caption  |11sp   |Regular |Timestamps, metadata          |
|Emergency|28–32sp|Bold    |Emergency screen text         |

### Accessibility Standards

- Minimum touch target: **56dp** for primary buttons, **44dp** for secondary
- Minimum font size: **16sp** for all patient-facing readable text
- Line height: **1.5x** font size minimum
- Letter spacing: **0.02em** on body text for improved readability
- Light mode only — dark mode reduces contrast on semantic colors and is harder to read for elderly users
- No gradients on interactive elements

-----

## Project Structure

```
lib/
├── constants/
│   ├── colors.dart           # Single source of truth for all colors
│   ├── text_styles.dart      # All text styles with correct sizes
│   └── dimens.dart           # Spacing, touch targets, border radii
│
├── services/
│   └── service_interfaces.dart  # Abstract contracts for all backend services
│                                 # AIService, STTService, TTSService,
│                                 # AgoraService, EmergencyService
│                                 # + all data models
│
├── widgets/
│   └── shared/
│       ├── sos_button.dart       # Persistent SOS floating button
│       └── bottom_nav_bar.dart   # Patient bottom navigation bar
│
├── screens/
│   ├── s11_home_dashboard.dart
│   ├── s12_sos_confirmation.dart
│   ├── s13_medication_schedule.dart
│   ├── s14_add_edit_medication.dart
│   ├── s15_appointment_reminders.dart
│   ├── s16_reminder_notification.dart
│   ├── s17_ai_buddy_chat.dart
│   ├── s17b_wellness_checkin.dart
│   ├── s22_wellness_history.dart
│   ├── s23_medication_adherence.dart
│   ├── s24_emergency_log.dart
│   ├── s25_my_profile.dart
│   ├── s26_patient_chat.dart
│   ├── s27_app_settings.dart
│   ├── s28_symptom_log.dart
│   └── s29_visit_summary.dart
│
└── medbuddy.dart             # Barrel export — single import for everything
```

-----

## Getting Started

### Prerequisites

- Flutter SDK 3.x or later
- Dart 3.x
- Android Studio or Xcode
- A Firebase project (for FCM push notifications)
- An Agora account (free tier covers MVP usage)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/medbuddy.git
cd medbuddy

# Install dependencies
flutter pub get

# Run on device or emulator
flutter run
```

### Required Dependencies

Add these to your `pubspec.yaml`:

```yaml
dependencies:
  flutter:
    sdk: flutter

  # Motion sensing for fall detection
  sensors_plus: ^4.0.0

  # Firebase for FCM push notifications
  firebase_core: ^2.0.0
  firebase_messaging: ^14.0.0

  # Agora real-time audio
  agora_rtc_engine: ^6.0.0

  # Local notifications
  flutter_local_notifications: ^16.0.0

  # State management (choose your preferred solution)
  provider: ^6.0.0

  # HTTP client for backend API
  dio: ^5.0.0

  # Secure storage for auth tokens
  flutter_secure_storage: ^9.0.0
```

### Environment Configuration

Create a `.env` file at the project root:

```env
# Backend
API_BASE_URL=https://your-backend.com/api

# Agora
AGORA_APP_ID=your_agora_app_id

# Firebase — handled via google-services.json / GoogleService-Info.plist

# Twilio (handled server-side — do not expose client-side)
```

-----

## Backend Integration

All backend hooks in the codebase are marked with `// TODO:` comments. Each screen accepts its dependencies as constructor parameters following the dependency injection pattern, so you can wire in your implementations without modifying screen code.

### Service Interface Pattern

```dart
// 1. Create your concrete implementation
class QwenAIService implements AIService {
  @override
  Future<String> sendMessage(String userMessage, {List<ChatMessage>? history}) async {
    final response = await _api.post('/chat', {
      'message': userMessage,
      'history': history?.map((m) => m.toJson()).toList(),
    });
    return response.data['content'];
  }

  @override
  Stream<String> streamMessage(String userMessage, {List<ChatMessage>? history}) async* {
    // implement streaming tokens
  }
  // ... implement remaining methods
}

// 2. Inject into the screen
AIBuddyChatScreen(
  aiService: QwenAIService(),
  sttService: WhisperSTTService(),
  ttsService: ElevenLabsTTSService(),
)
```

### Key Integration Points

|Service                          |Screen(s)              |Backend endpoint            |
|---------------------------------|-----------------------|----------------------------|
|`AIService.sendMessage`          |S-17, S-17b            |`POST /api/chat`            |
|`STTService.startListening`      |S-17, S-17b, S-20      |Faster-Whisper              |
|`TTSService.speak`               |S-16, S-17, S-17b, S-20|ElevenLabs / XTTS           |
|`AgoraService.openChannel`       |S-21, S-26             |Agora RTC                   |
|`EmergencyService.triggerSOS`    |S-12, S-18             |`POST /api/emergency/sos`   |
|`EmergencyService.verifyLiveness`|S-20                   |`POST /api/emergency/verify`|

-----

## Roadmap

|Phase                     |Status           |Description                                               |
|--------------------------|-----------------|----------------------------------------------------------|
|Phase 1 — MVP             |Frontend complete|Profile setup, medications, appointments, manual SOS      |
|Phase 2 — Voice           |Frontend complete|AI check-ins, full voice interaction, wellness history    |
|Phase 3 — Fall Detection  |Frontend complete|Accelerometer monitoring, two-factor liveness verification|
|Phase 4 — Caregiver Mobile|Frontend complete|Full caregiver role, emergency screen, messaging          |
|Phase 5 — Symptom Logging |Shell complete   |Voice symptom log, doctor visit summaries                 |
|Phase 6 — Apple Watch     |Planned          |watchOS companion app, HealthKit integration              |
|Backend integration       |In progress      |FastAPI, Qwen 2.5, Whisper, XTTS, FAISS RAG               |

-----

## Notes

- **Light mode only** — dark mode is intentionally not supported. It reduces contrast on semantic color elements and is harder to read for elderly users during extended use
- **No VoIP** — all real-time audio between patient and caregiver uses the Agora SDK. Twilio Voice has been removed from the communication path entirely
- **Agora free tier** — 10,000 minutes/month. At MVP scale with a small test group, typical usage is well under 500 minutes/month
- **Twilio SMS cost** — approximately $0.0079 per SMS. Negligible at MVP scale
- **Never hardcode colors** — always import from `constants/colors.dart`. All hex values live in one place
- **SOS button is always visible** — it must appear on every screen via the shared `SOSButton` widget placed inside a `Stack`. No exceptions

-----

*MedBuddy v2.0 — March 2026*
