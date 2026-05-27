# RideGuard System Workflow

RideGuard is a school transportation management system with AI anomaly detection. The application must keep the full safety workflow intact across parent/guardian, driver, and school guard roles.

## Core Principles

- Preserve role-specific dashboards for Parent/Guardian, Driver, and School Guard.
- Preserve multi-step parent registration.
- Preserve child profile creation and unique child QR generation.
- Preserve GPS tracking, QR verification, push notifications, AI monitoring, ratings, and feedback.
- Do not replace real transaction state with static demo values.
- Parent, driver, and guard screens must reflect shared database state.

## Roles

### Parent/Guardian

Parents register accounts, manage children, book school transportation, monitor active trips, receive safety notifications, and rate drivers after completed trips.

### Driver

Drivers receive trip requests, accept or decline trips, verify children through QR scanning, transport students, trigger trip status updates, and participate in AI/GPS monitoring during active trips.

### School Guard

Guards verify students at the school gate through QR scanning, record verification history, and support manual review for failed verifications.

## Authentication Flow

### Splash Screen

- Show RideGuard logo.
- Automatically navigate to landing page.

### Landing Page

- Login button.
- Sign Up button.

### Parent Registration

Step 1: Parent Details

- First name
- Last name
- Email
- Phone number

Step 2: Child Details

- Child first name
- Child last name
- Date of birth
- Grade level
- School

Step 3: Password Setup

- Password
- Confirm password

After successful registration:

- Create parent account.
- Create child profile.
- Generate unique QR code for child.
- Redirect to login page.

### Login

Inputs:

- Email
- Password

After login, redirect by role:

- Parent Dashboard
- Driver Dashboard
- Guard Dashboard

## Parent Workflow

### Parent Dashboard

Must show:

- Active trip status.
- Registered children.
- Upcoming scheduled trips.
- Notifications.

Bottom navigation:

- Home
- Track
- Alerts
- Profile

### Book Trip

Step 1: Driver Selection

- Driver name
- Driver rating
- Driver safety score
- Vehicle information
- Availability status

Step 2: Trip Scheduling

- Home to School or School to Home.
- Pickup location.
- Drop-off location.
- Pickup date.
- Pickup time.

Step 3: Booking Summary

- Selected driver.
- Child details.
- Schedule.
- Trip details.
- Confirm Trip button.

### After Booking

- Trip is created as `pending`.
- Parent cannot monitor yet.
- Parent sees waiting state until driver accepts.
- Parent receives notification: `Driver accepted your trip request`.

### Active Trip Monitoring

Monitoring opens only after driver acceptance.

Must show:

- Live GPS location.
- Route map.
- Driver details.
- Estimated arrival time.
- Safety statistics.
- Trip status.

Parent notifications:

- Driver accepted request.
- Child picked up.
- QR verification complete.
- Child arrived safely.

### After Trip

Rating screen:

- Star rating from 1 to 5.
- Optional feedback.

Save:

- Driver rating.
- Feedback.

## Driver Workflow

### Driver Dashboard

Must show:

- Availability toggle.
- Incoming trip requests.
- Active trips.
- Trip history.

Bottom navigation:

- Home
- Trips
- Alerts
- Profile

### Trip Request

Must show:

- Student name.
- Pickup address.
- Drop-off address.
- Estimated distance.
- Departure time.

Actions:

- Accept.
- Decline.

### If Driver Accepts

- Trip status changes from `pending` to `accepted`.
- Parent receives notification: `Driver accepted your trip`.
- Parent monitoring becomes available.

### Pickup Flow

- Driver navigates to pickup location.
- Driver opens QR scanner.
- Driver scans child QR code.

If verified:

- Send pickup notification to parent.
- Change trip status to active.

### During Trip

AI monitoring module is active.

Collect:

- Accelerometer data.
- Gyroscope data.
- GPS data.

Detect:

- Sudden braking.
- Overspeeding.
- Sudden turns.
- Unsafe driving behavior.

Display:

- Live GPS tracking.
- Current trip status.

### Trip Completion

- Driver scans QR again.
- If verified, mark trip completed.
- Send arrival notification.

Store:

- Duration.
- Distance.
- Timestamp.

## School Guard Workflow

### Guard Dashboard

Must show:

- Scan activity.
- Recent scans.
- Verification history.

Bottom navigation:

- Home
- Scan
- Profile

### Trip Phase Selection

- Home to School.
- School to Home.

### QR Verification

Guard scans student QR code at school gate.

Record:

- Student name.
- Timestamp.
- Verification result.
- Parent notification status.

Handle:

- Failed verifications.
- Manual review.

## Trip Status Model

Recommended status transitions:

1. `pending`: parent booked, driver has not accepted.
2. `accepted`: driver accepted, parent can monitor.
3. `qr_verified`: child QR verified at pickup or gate.
4. `in_progress`: trip is active.
5. `completed`: child arrived safely and trip is finished.
6. `cancelled`: trip declined or cancelled.

Monitoring must be blocked while status is `pending`.

## Database Entities

Core entities:

- USER
- PARENT
- DRIVER
- GUARD
- CHILD
- SCHOOL
- VEHICLE
- TRIP
- VERIFICATION
- GPS_TRACKING
- GEOFENCE
- GEOFENCE_EVENT
- AI_MONITORING
- STUDENT_READINESS
- RATING
- NOTIFICATION
- BIOMETRIC_VERIFICATION

## AI Anomaly Detection

Inputs:

- Accelerometer.
- Gyroscope.
- GPS.

Detect:

- Speed anomalies.
- Sudden movement.
- Unsafe behavior.

Output:

- Severity level.
- Description.
- Suggested action.

## Notification System

Parent notifications:

- Driver accepted trip.
- Pickup completed.
- QR verified.
- Child arrived safely.

Driver notifications:

- New trip request.
- Trip updates.

Guard notifications:

- Verification alerts.

## Implementation Guardrails

- Never hard-code parent, child, driver, or trip IDs for real transactions.
- Use authenticated role context for all mutations.
- Use database state to render dashboards.
- Keep parent monitoring locked until driver acceptance.
- Enforce child limits where required by product rules.
- Keep QR verification as a required safety step.
- Store AI/GPS events separately from trip records.
- Treat notifications as first-class records, even if push delivery is simulated during prototype stages.
