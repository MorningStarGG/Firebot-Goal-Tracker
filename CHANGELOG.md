# Changelog

## 1.1.0

A major update adding support for multiple independent goals, scheduled StreamElements goal resets, more flexible overlay layouts, and native Firebot 5.67.0 plugin integration. This release also includes substantial improvements to display behavior, data handling, and reliability.

### Added

#### Multiple goals and goal management

- Added support for multiple independent goals, each with its own saved settings, donations, overlay placement, and polling.
- Added a stable **Goal ID** to tracker effects. New effects receive an automatically generated ID, effects with the same ID control the same goal.
- Standardized Goal IDs across tracker effects, Advanced Goal Manager actions, and replace variables. IDs are trimmed, converted to lowercase, have spaces replaced with underscores, and receive a `goal_` prefix if one is missing. For example, `Monthly Support` becomes `goal_monthly_support`. Display titles are unchanged.
- Added a goal selector to **Advanced Goal Manager**, along with each goal's running status and its last successful StreamElements reset, when available.
- Added **Hide Goal** to stop a selected goal's display and polling without deleting its configuration or donations.
- Added optional Goal ID selectors to replace variables, allowing them to target individual goals:
  - `$goalInfo[amount, id=goal_monthly_support]`
  - `$goalMilestones[next, name, id=goal_monthly_support]`
  - `$goalDonation[Alice, 5, goal_monthly_support]`
- Added automatic migration from the legacy single-goal database, including Goal ID normalization, retained backups, and collision detection. See **Upgrade notes** before upgrading an installation with multiple saved goals.

#### StreamElements goal resets

- Added **Automatically Reset StreamElements Goals**, disabled by default, using the selected **Date Range** for weekly or monthly resets.
- Added **Reset StreamElements Goals Now** to Advanced Goal Manager. Manual and scheduled resets use the same reset process.
- Implemented StreamElements' dashboard **Reset goals** operation through `PUT /kappa/v2/sessions/{channel}`. A reset clears all seven account goal-progress values: followers, subscribers, tips, cheers, merchandise total, merchandise items, and merchandise orders.
- Scheduled weekly resets for Sunday and monthly resets for the first day of the month, based on the computer's local time. Enabling automatic resets or changing the Date Range schedules the next reset boundary.
- Added one catch-up reset when Firebot starts after one or more missed periods. Failed resets remain eligible for retry, and a reset is recorded as completed only after it succeeds.
- Coordinated resets across goals sharing the same StreamElements account to avoid duplicate requests. Goals that automatically reset the same account must use the same Date Range, conflicting settings are rejected.
- After a successful reset, affected StreamElements snapshots and pre-reset event history are invalidated without removing local donations.
- Kept explicitly enabled reset schedules active even when their corresponding goal widgets are hidden, without restarting polling or displaying those goals.

#### Overlay sizing and positioning

- Added independent **Width PX** and **Scale %** controls, defaulting to the existing 475px width and 100% scale. Width changes the available text space, scale resizes the entire widget proportionally.
- Added **Auto Adjust Goal Width for Text**, disabled by default. When enabled, the widget animates its width over 350ms to fit milestone/percentage and amount text, including padding. **Width PX** acts as the maximum and 475px as the minimum, although visible countdown text can require additional space. Fixed-width behavior remains the default.
- Added **Keep Info Section Default Width** alongside automatic width adjustment. This optional setting keeps the countdown and information sections, countdown logos, and event animation at their original width while the progress bar expands or contracts. These elements remain centered, respect padding and scaling, and work above or below the bar. Countdown text fits within its own panel rather than widening the bar. The setting is disabled by default, applies only when automatic width adjustment is enabled, and carries forward the earlier info-only preference.
- Added **Edge Gaps** for preset positions (Top, Bottom, Left, and Right). Gaps default to zero, use overlay pixels independently of scaling, and keep the widget centered within the inset area throughout width animations. Custom coordinates remain independent.

#### Appearance and customization

- Added separate header and subheader background controls, each with two colors and a choice of **Diagonal Gradient**, **Centered Gradient**, **Solid**, or **None**.
- Preserved the original appearance with a **None** header and **Diagonal Gradient** subheader by default. Choosing **None** makes only that text panel transparent without removing its spacing.
- Preserved existing saved background styles. Older shared settings initialize both panels, but subsequent edits are independent. Extra Life colors respect each panel's selected style and preserve custom colors for reuse when disabled. The surrounding event box keeps its own background controls and track alignment.

#### Firebot integration and release tooling

- Added native Firebot 5.67.0 plugin lifecycle handling and declarative registration for effects, replace variables, frontend listeners, and HTTP routes.
- Added community-release metadata and checksums generated from the built plugin, CI verification, and a manually triggered draft-release workflow. Publishing and catalog submission remain manual.

### Changed

#### Goal lifecycle and overlay isolation

- Saved goals now remain idle when the plugin loads. Polling and Manager donation edits send data-only updates and cannot create, replace, or restore a goal widget that is not currently displayed.
- Each goal now renders in its own iframe, isolating styles, DOM elements, timers, and listeners. Replacing or hiding a goal, or unloading the plugin, cleans up its display and polling.
- Replaced the global polling interval with per-goal polling that prevents overlapping requests and ignores outdated asynchronous results after a goal is replaced or hidden.
- Plugin shutdown now stops active displays and polling, rejects new operations, and waits for accepted edits and submitted resets to finish persisting. Duplicate enabled installations are rejected before their registrations can conflict.

#### StreamElements and Manager behavior

- Shared StreamElements event history, cached account requests, and reset coordination between goals using the same account, while keeping each goal's conversion values, local donations, and display settings independent.
- Renamed Manager actions to **Clear Cached StreamElements Data**, **Clear Cached Extra Life Data**, and **Reset Local Donations** to distinguish clearing cached API data from resetting the remote account.
- Renamed the StreamElements range setting to **Date Range**, and improved Goal ID guidance, reset explanations, Manager feedback, and accessibility labels.

#### Plugin infrastructure and overlay delivery

- Replaced deprecated script types/modules and webpack tooling with `@crowbartools/firebot-types@5.67.0`, tsdown, and updated TypeScript/Jest tooling.
- Updated goal-event delivery to use Firebot's supported effect overlay sender, preserving default and named-overlay targeting. The overlay template route is now `/plugins/goal-tracker/goal-tracker.html`.
- Updated custom logos to use Firebot's permanent resource-token API rather than exposing private file paths in overlay data.
- Reorganized configuration, persistence, polling, source reconciliation, reset coordination, shared presentation rules, and overlay rendering into focused modules. Removed unused donation-update, combined-total, custom-donation-flag, and shape-specific new-donation paths.

### Fixed

#### StreamElements data and donations

- Preserved **Date Range** filtering for named StreamElements events, with local donations merged into totals whether automatic resets are enabled or disabled. Local donations outside the selected range remain stored.
- Reconciled observed StreamElements events with dashboard goal-progress counters without double-counting contributions. Dashboard counters remain a fallback when event history is incomplete. Date Range does not select weekly or monthly aggregate endpoints.
- Retained and deduplicated observed donor events, names, and subscription tiers across polls. Subscriber counts without matching tier records use the configured tier 1 value.
- Invalidated older source history when dashboard counters decrease, preventing stale values from being reused after a reset or other account change.
- Preserved Extra Life donation history and explicit new-donation handling while discarding obsolete polling results.

#### Overlay layout and text

- Removed a 2px horizontal margin that shifted the visible progress bar off-center relative to the countdown and information sections, while retaining symmetrical internal padding.
- Kept titles, milestone names, and amounts on one line. Space is reserved for the amount, longer text shrinks to a minimum of 16px before using an ellipsis, then returns to its normal size when shorter text appears.
- Made oversized widgets scale down uniformly to fit the available overlay area and return to the requested scale when space permits. Sizing remains independent for each goal.
- Corrected countdown and information-section positioning validation to use their respective position settings.
- Improved automatic-width animation and text-sizing stability so changing goal text does not cause repeated font-size changes or unwanted fading during resizing.

#### Milestones and replace variables

- Standardized amount formatting, cent rounding, percentages, milestone selection, and period rules between backend calculations and the overlay.
- Fixed exact milestone completion: reaching a $250 milestone now advances the active target beyond that milestone.
- Restored the main goal as the active target after the final milestone, while retaining milestones above the main goal and completed-milestone cycling.
- Limited **Show Completed Milestones** to **All Milestones** cycling mode and kept the correct rotation order as completed milestones become ineligible.
- Allowed percentage labels to exceed 100% without letting progress fill extend beyond the bar.
- Corrected `$goalInfo` timecode, formatted-time, and zero-padding option casing, and selected currency symbols from the appropriate source template.
- Fixed next/previous milestone variable selection at exact milestone values and after completion, with consistent amount and percentage formatting.
- Enabled donor rotation for local donations as well as StreamElements and Extra Life donations.

#### Themes and customization

- Applied the Extra Life color palette consistently to the progress bar, countdown, information section, animations, and progress glow, including older saved configurations with red/black animation colors.
- Centralized Extra Life palette handling and corrected the second animation background color property. Turning off **Use Extra Life Colors** restores the user's custom colors.
- Restored default theme colors when separate information-row colors are disabled or blank, without discarding saved custom colors.

#### Settings, overlay routing, and security

- Fixed settings-controller loading under Firebot's `eval(raw)` environment by using a compatible arrow-expression callback. This restores controller execution and save validation, including width/scale prefilling and conversion of saved ISO dates into Angular date values.
- Updated width and scale fields to use Firebot's supported numeric-input attributes and convert saved text values to numbers. Existing custom dimensions are preserved, missing values default to 475px and 100%.
- Corrected routing of show, update, and remove messages to the selected default or named overlay instance.
- Preserved user-entered titles and templates literally when building overlay documents, including dollar signs and embedded script delimiters.
- Generated permanent resource tokens for custom logos when their tracker effects run, and removed account credentials and private logo paths from overlay payloads.

#### Data integrity and runtime reliability

- Serialized local donation read/modify/write operations to prevent lost edits, and assigned stable IDs to individual donations with a timestamp fallback for older records.
- Added validation for donor names, positive finite amounts, safe currencies, goals, milestones, date ranges, and source settings. Donor totals are recalculated after filtering and edits.
- Normalized numeric settings and bounded polling and timing values. Invalid API responses no longer replace the last valid processed snapshot.
- Improved shutdown cleanup for pollers, goal displays, maintenance timers, and the custom overlay route.

### Upgrade notes

- Existing tracker effects and variable calls without a Goal ID use `goal_default`. The previous `default` selector is still accepted.
- The legacy `/goal` record is copied to `/goals/goal_default` and kept as a backup. Schema version 4 normalizes saved IDs and, when IDs change, preserves the original goal map under `/goalIdMigrationBackups/v4`. Earlier migration backups are retained.
- **Important:** If two saved Goal IDs normalize to the same value, migration stops rather than overwriting either goal. Rename one of the IDs in the previous script version before upgrading.
- **When copying a tracker effect, change its Goal ID if you want a separate goal.** Copied effects retain the original ID and therefore control the same tracker until changed.
- StreamElements dashboard counters cannot recover missing historical donor names or subscription tiers. As a result, named-donor subtotals may be lower than totals supplemented by those counters.

### Documentation and verification

- Replaced the browser smoke test's silent 10-second port-file wait with process-aware startup and a 30-second deadline. Wait for a usable debugger page, handle stderr announcements/partial port files/delayed endpoints, and retain browser output and process status on failures. Added startup/error/cleanup regression coverage.
- Expanded the README with multi-goal setup, Goal ID normalization, activation behavior, replace-variable examples, milestone behavior, theme customization, reset scope and schedules, migration, and build instructions. Corrected installation guidance to list both registered effects.
- Added `npm run typecheck`, `npm run test:browser`, Jest support for raw HTML imports, and test fixtures. The suite includes **68 tests across 12 test suites**.
- Added production-bundle browser tests for independent goals, effect-only creation, overlay isolation, refreshes, milestones, overfunding, literal templates, hiding/replacement, stale events, Extra Life colors, information-row styling, and rendered shine animations.
- Added settings and layout tests for legacy sizing defaults, width/scale controls, preset anchors, custom offsets, automatic width changes, text fitting and ellipsis, font recovery, edge gaps, countdown padding, reduced-motion handling, and resizing across overlay dimensions.
- Verified settings-controller evaluation in an isolated `eval(raw)` context and the production settings template with AngularJS 1.8.3 and Firebot 5.67.0's numeric input component. Tests cover default and saved dimensions, validation, Manager actions, and ISO date/time restoration without calendar-day shifts. Angular is used for development and testing only.
- Added a regression test for font-size instability during width growth, covering the reported 700px / 100% scenario and recovery when text shortens.
- **Verification status:** TypeScript checking, all 68 tests, the production build, and browser smoke tests passed locally. The GitHub Actions browser run still needs verification. A live StreamElements reset from Advanced Goal Manager was also confirmed. Scheduled reset timing and behavior in default/named Firebot overlays still require live verification.
