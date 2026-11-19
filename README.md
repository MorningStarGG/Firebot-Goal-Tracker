# Advanced Goal Tracker for Firebot

A customizable goal and donation tracker for Firebot overlays. Track support from **StreamElements**, **Extra Life**, and manual donations, display progress, milestones, countdowns, and donor information, and run multiple goals independently.

**Requires Firebot 5.67.0 or newer.**

## Features

- **Multiple goals:** Run separate trackers for different events or fundraising campaigns, each with its own settings, donations, and overlay position.
- **Live progress:** Update goals from StreamElements, Extra Life, or donations entered through Firebot.
- **Milestones and countdowns:** Show upcoming targets, rotate through milestones, and display customizable countdowns.
- **Flexible overlays:** Choose your layout, colors, logos, animations, text, and information panels.
- **Automatic sizing:** Adjust the bar width to fit changing goal text, or set a fixed width and scale.
- **Goal management:** Add or remove local donations, manage individual donors, hide goals, and refresh cached data.
- **Optional StreamElements resets:** Reset account goal-progress counters weekly or monthly, or manually from the Manager.

## Installation

1. Download **`MSGG-GoalTracker.js`** from a release.
2. In Firebot, open **Tools → Plugin Manager**, select **Install From File**, and choose the downloaded file.
3. Add the **Advanced Goal Tracker** effect to an event, command, or other Firebot action.
4. Configure the goal, then run the effect to display it in your chosen overlay.

The plugin also adds an **Advanced Goal Manager** effect and goal-related replace variables.

> **Important:** Installing or loading the plugin does not automatically display saved goals. A goal appears when its **Advanced Goal Tracker** effect runs.

Upgrading from the previous startup-script version? Read [Upgrading and existing data](#upgrading-and-existing-data) before installing.

## Getting started

### Create a goal

In the **Advanced Goal Tracker** effect:

1. Set a **Goal ID** (or use the automatically generated one).
2. Set your goal amount and any start/end dates or countdown settings.
3. Choose **StreamElements**, **Extra Life**, and/or local donation tracking as needed.
4. Customize the progress bar and select its overlay position.
5. Run the effect to show the tracker.

Running the effect again updates that goal's display and settings without removing its local donations.

### Run multiple goals

Each independent goal needs a different **Goal ID**. For example, you could use `charity` and `monthly_support` to create two separate trackers.

- Effects using the **same ID** control the **same goal**, regardless of their display titles.
- Effects using **different IDs** have separate settings and local donations. They can appear in the same overlay, so choose positions that don't overlap.
- **Copying a tracker effect copies its Goal ID.** Change the ID in the copy if you want a new, independent goal.
- Hiding a goal removes its display and stops its polling, but **keeps its saved settings and donations**.

Goal IDs are normalized automatically: `Monthly Support`, `monthly_support`, and `goal_monthly_support` all refer to `goal_monthly_support`. Existing effects without an ID use `goal_default`. Titles shown on your overlay are separate from Goal IDs.

## Donation sources

### Extra Life

Enable **Extra Life** in the tracker effect and enter your **Participant ID**. The tracker can update donation information automatically, and you can optionally use Extra Life's color theme.

### StreamElements

Enable **StreamElements**, enter your **Channel ID** and **JWT Token**, and configure the values used for subscriptions and bits. You can also include local donations in the total.

The **Date Range** setting filters the named donation/event history and any merged local donations. StreamElements' account goal-progress counters can supplement incomplete event history, without counting the same contributions twice. Date Range does **not** switch between StreamElements' weekly and monthly aggregate endpoints.

StreamElements only exposes a limited amount of historical event detail. The tracker remembers events it has already seen, but older totals may not include every donor name or subscription tier. When a subscriber count has no matching tier information, the configured Tier 1 value is used.

Goals connected to the same StreamElements account share source history and account counters, but can use different contribution values, local donations, and display settings.

### Local donations

Use **Advanced Goal Manager** to record or adjust donations manually. You can remove a matching donation, reset an individual donor's donations, or reset a selected goal's local donation records.

Local donations are stored with the goal and are **not removed by StreamElements account resets**.

## StreamElements automatic resets

Automatic resets are **disabled by default**, including for existing goals after upgrading.

Enable **Automatically Reset StreamElements Goals** to reset the account's goal-progress counters according to the selected **Date Range**:

| Date Range | Reset schedule |
| --- | --- |
| Weekly | Sunday, using the computer's local time |
| Monthly | First day of each month, using the computer's local time |

Changing the Date Range or enabling automatic resets schedules the **next** reset boundary, it doesn't immediately reset the account. To reset immediately, use **Reset StreamElements Goals Now** in **Advanced Goal Manager**.

**Important: These are real StreamElements account resets, not just visual resets of this overlay.** They perform the equivalent of the StreamElements dashboard's **Reset goals** action, resetting follower, subscriber, tip, cheer, and merchandise goal-progress counters (total, items, and orders). **Every widget using that StreamElements account is affected.** Local donations are preserved.

A few things to know:

- If Firebot was closed during a scheduled reset, the plugin performs **one catch-up reset** the next time it loads, even if several periods were missed. Failed resets remain due for retry.
- Goals sharing a StreamElements account cannot have conflicting **automatic reset** schedules. They must use the same Date Range, and the account is reset only once.
- Goals without automatic resets can use their own Date Range filters, but still see resets made to that shared account.
- **Hiding a goal does not disable an automatic reset schedule** already enabled for its account.
- After a reset, the tracker excludes pre-reset StreamElements events from its displayed source totals. Local donation records remain available.

**Clearing cached data is different from resetting the account.** **Clear Cached StreamElements Data** and **Clear Cached Extra Life Data** discard the selected goal's processed source data so it can be fetched again. **Reset Local Donations** deletes that goal's manually entered donations.

## Customize the overlay

### Size and positioning

| Setting | What it does |
| --- | --- |
| **Width PX** | Sets the widget's layout width, from 200 to 3840 pixels (default: 475). Creates more room for text without making it larger. |
| **Scale %** | Resizes the entire widget proportionally, from 10% to 300% (default: 100%). |
| **Auto Adjust Goal Width for Text** | Smoothly adjusts the width as milestone and amount text changes. Off by default. |
| **Keep Info Section Default Width** | When auto-width is on, keeps the countdown and information sections at their original width while the bar changes width. Off by default. |
| **Edge Gaps (pixels)** | Adds space between a preset-position widget and the overlay edges, independently of widget scale. |

For example, try **700px / 100%** to give text more space, or **475px / 125%** to make the entire widget larger.

With **Auto Adjust Goal Width for Text** enabled, **Width PX** becomes the maximum width and must be at least **475px**. The bar grows or shrinks to fit its text, down to its original 475px layout (or enough room for a visible countdown). **Keep Info Section Default Width** can keep the countdown, its logos, and the information area centered at their original width instead of resizing with the bar.

Long bar titles, milestones, and amounts stay on one line. If necessary, their text gets smaller and eventually truncates with an ellipsis, normal text size returns when space allows. Automatic width changes animate smoothly, and oversized widgets scale down to fit the available overlay space.

Use Firebot's position selector to choose a preset location, then adjust **Top / Bottom** and **Left / Right** Edge Gaps if needed. For example, select **Top Middle** and set **Top** to **60** for a centered bar with space above it. **Custom** positioning uses its own coordinates and does not use preset Edge Gaps.

### Progress, milestones, and countdowns

- Set the progress bar's colors, opacity, title, and displayed values.
- Create milestones and choose whether to use them as active goals or cycle between them.
- Show a countdown above or below the progress bar, with optional cycling and custom text/colors.
- Show an information section with recent or largest donations, donor rotation, and custom messages.
- Customize animation timing, text templates, currency symbols, and optional logos.

A milestone counts as completed **as soon as its target is reached**. For example, reaching $250 advances the active target past a $250 milestone. After the last milestone, the active target returns to the main goal. The **Show Completed Milestones** option applies to **All Milestones** cycling mode.

Progress percentages can exceed 100% when you pass a goal, while the bar fill stays within its track.

### Colors and animations

Choose custom colors or enable **Use Extra Life Colors** to apply the Extra Life palette across the bar, countdown, information area, animations, and glow. Turning it off restores your custom colors.

The animation **header** and **subheader** can each have their own colors and background style: **None**, **Solid**, **Diagonal Gradient**, or **Centered Gradient**. They can be configured independently, and a transparent text panel keeps its layout spacing.

## Manage and update goals

Use the **Advanced Goal Manager** effect to select a goal and perform actions such as adding or removing local donations, resetting an individual donor, hiding the goal, clearing cached source data, or resetting StreamElements goal-progress counters.

Donations from connected services also update the tracker automatically while that goal is running.

### Replace variables

Existing variable calls without a Goal ID use `goal_default`. To read another goal, provide its ID:

```text
$goalInfo[amount, id=goal_charity]
$goalInfo[timeCode, id=goal_charity]
$goalMilestones[next, name, id=goal_charity]
$goalDonation[Alice, 5, goal_charity]
```

You can use an ID with or without the `goal_` prefix, spaces and capitalization are normalized automatically. For example, `id=Monthly Support` selects `goal_monthly_support`.

**Note:** `$goalDonation` looks up **local donation records only**, not the StreamElements or Extra Life histories.

## Upgrading and existing data

If you're moving from the older startup-script version or updating an existing plugin installation:

1. **Back up your Firebot profile** and update Firebot to **5.67.0 or newer**.
2. Remove the old startup-script copy so it cannot run alongside the plugin. In **Plugin Manager**, install the Advanced Goal Tracker plugin entry using **Install From File** and the new `MSGG-GoalTracker.js`, rather than creating a duplicate installation.
3. If multiple enabled tracker installations are present, remove the duplicates, restart Firebot, and install one copy.
4. Refresh the overlay browser source, then run the tracker effects you want to display.

Existing effects, variable calls, settings, and donation history are intended to carry over. The old single-goal configuration becomes `goal_default`, and prior Goal IDs are normalized to the `goal_` format. The plugin retains backups during migration.

**Check Goal IDs before upgrading.** If two saved IDs would normalize to the same value, migration stops rather than overwrite either goal. Rename one of them in the previous version before retrying.

**Keep the same Plugin Manager entry for future updates.** Its installed ID determines where the plugin saves data. Installing under a new ID uses a different storage folder and may require restoring your latest plugin database backup. The original legacy backup does not contain changes made after migration.

<details>
<summary>Technical migration and storage details</summary>

The plugin imports the previous profile database at `db/goalTracker.db` into `script-data/<installed-plugin-id>/goalTracker.db` on first load. It retains the original and an additional `legacy-goalTracker.db.backup` in plugin storage. Existing plugin data takes precedence over a fresh import.

The old `/goal` record is copied to `/goals/goal_default`. When ID migration changes names, an original goal-map backup is saved at `/goalIdMigrationBackups/v4`, older backups are retained. Data is staged and validated before replacement. Invalid databases or colliding goal IDs stop the load rather than silently starting with empty data. Account history and reset completion information are preserved by migration.

Goal IDs are trimmed, lowercased, have runs of spaces replaced with underscores, and receive a `goal_` prefix when missing. The part after that prefix must start with a letter or number, may use letters, numbers, hyphens and underscores, and is limited to 64 characters.

</details>

## Troubleshooting

**The goal doesn't appear:** Make sure you've run its **Advanced Goal Tracker** effect. Installing the plugin or editing a saved goal does not automatically display it. Confirm the selected overlay/browser source and the goal's placement.

**Donations aren't updating:** Check the source is enabled, verify its ID/token or Participant ID, and confirm your internet connection. A hidden goal does not continue polling for donation updates.

**The widget looks clipped or doesn't fit:** Try a smaller **Scale %**, a wider overlay/browser source, or a different preset position or Edge Gap. The widget also attempts to fit itself to the available space automatically.

**Animations or changes aren't visible:** Check the effect's animation settings and refresh the overlay browser source.

**StreamElements totals or resets look unexpected:** Review **Date Range**, automatic-reset settings, and whether other goals share the same StreamElements account. Remember that a reset affects the account, not only one visible bar.

**A plugin update appears to have lost goals:** Check whether the plugin was reinstalled under a new Plugin Manager ID before changing or replacing any saved database files.

For additional help, report the Firebot version, the affected effect/Goal ID, what you expected, and what occurred. **Do not share JWT tokens or other account credentials.**

## For developers

Requires **Node.js 22.18+** to build from source (CI uses Node 24).

```bash
git clone https://github.com/MorningStarGG/Firebot-Goal-Tracker.git
cd Firebot-Goal-Tracker
npm ci
npm run build:prod
```

The installable file is **`dist/MSGG-GoalTracker.js`**. `npm run build:dev` watches for changes but does not deploy into your live Firebot profile.

To run checks:

```bash
npm run typecheck
npm test -- --runInBand
npm run test:browser
```

Browser tests use the production bundle and an installed Chromium-based browser (or `CHROME_PATH`). They check display behavior, settings, and several upgrade and regression cases. API tests use mocks and migration tests use temporary profiles, they do not reset a live StreamElements account. **Check both default/named overlays and test any account-reset feature in a controlled live Firebot setup before relying on it during a stream.**

The browser launcher allows up to 30 seconds for startup and waits for a usable page debugger. It accepts Chrome's debugger announcement or `DevToolsActivePort`, retries endpoint initialization, and reports launch errors, exit status, the selected executable, and recent browser output if startup fails. Failed launches are terminated before the temporary profile is removed.

### Preparing a community release

After building and testing:

```bash
npm run release:prepare -- --tag v1.1.0
```

The tag must match `package.json`. This generates `release/community-plugin.json` and `release/SHA256SUMS` for the built plugin, to accompany `dist/MSGG-GoalTracker.js`.

The manual **Prepare draft plugin release** GitHub Actions workflow verifies the build/tests and creates a **draft** release. Publishing and Community Plugins submission remain manual steps. Review the draft and perform a live install/update/restart check before publishing.

## License

This plugin is provided as-is under the [GPL-3.0 license](LICENSE). You are free to modify and distribute it according to your needs.

## Acknowledgments

Special thanks to the Firebot community for their support and contributions.

---

**AI Disclaimer:** Parts of this was made with various AI tools to speed development time.
