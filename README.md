# Advanced Goal Tracker for Firebot

A highly customizable goal and donation tracking system with countdown functionality for Firebot. Perfect for charity streams, fundraising events, and general donation tracking.

## Features

### Core Features
- Real-time donation tracking
- Multiple data sources (StreamElements, Extra Life, custom)
- Customizable overlay display
- Countdown timer with multiple modes
- Milestone tracking
- Extensive theming options

### Data Integration
- Extra Life integration with auto-updating donation data
- StreamElements integration with bits, subscriptions, and tips support
- Custom JSON donation data support
- Local donation tracking

### Display Options
- Customizable progress bar
- Dynamic milestone display
- Info section with recent and largest donations
- Animated transitions
- Logo display support
- Flexible countdown positioning

### Visual Customization
- Fully customizable color schemes
- Extra Life theme support
- Custom messages and formats
- Font and text customization
- Animation settings

## Usage

### Basic Setup

1. Add the "Advanced Goal Tracker" effect to your desired event, command, etc
2. Configure basic settings:
   - Set start and end dates/times
   - Configure your donation goal
   - Customize display options

### Data Sources

#### Extra Life
1. Enable Extra Life integration
2. Enter your Participant ID
3. Optionally enable Extra Life color scheme

#### StreamElements
1. Enable StreamElements integration
2. Enter your Channel ID and JWT Token
3. Configure subscription and bits values
4. Optionally enable local donation merging

#### Custom Data
1. Enable "Use JSON Donation Data"
2. Provide donation data in the required JSON format
3. Set update intervals as needed

### Customization Options

#### Visual Settings
- Progress bar colors and opacity
- Info section colors and layout
- Animation colors and timing
- Countdown display options

#### Text Templates
- Donation messages
- Countdown text
- Milestone text
- Support messages

## JSON Data Format

For custom donation tracking, use the following format:

```json
[
    {
        "donations": [
            {
                "name": "Donor Name",
                "individual_donations": [
                    {
                        "amount": 100,
                        "timestamp": "2024-11-06T12:30:00Z"
                    }
                ],
                "total_amount": 100,
                "total_donations": 1
            }
        ],
        "overall_total": {
            "amount": 100,
            "donation_count": 1
        }
    }
]
```

## Configuration Options

### Countdown Settings
- Show/hide countdown
- Enable countdown cycling
- Position (above/below progress bar)
- Custom colors and text

### Goal Bar Settings
- Progress bar opacity
- Show/hide title
- Custom colors
- Progress display options

### Milestone Settings
- Custom milestone goals
- Milestone text
- Use milestones as goals option

### Info Section Settings
- Show/hide info section
- Enable info cycling
- Separate color schemes
- Custom messages

## Updates

The tracker can be updated in real-time using:
- The "Update Goal Tracker Data" effect
- The "Update Goal Tracker Local Data" effect
- API integrations (Extra Life/StreamElements)

## Requirements

- Firebot 5.0 or higher

## Installation

1. Download the script files or build it from source following the below instructions
2. **Place the Script in Firebot Scripts Folder**  
   - In Firebot, navigate to **Settings > Scripts > Manage Startup Scripts**.  
   - Click **Add New Script**.  
   - In the blue notification bar, click the link labeled **scripts folder**.  
   - Copy the downloaded script into this folder.  
   - Hit the **refresh button** beside the **Select script** dropdown.  
   - Select **MSGG-GoalTracker.js** from the dropdown menu.  
   - Click **Save**.
3. The script will add three new effects for use in Firebot: Advanced Goal Tracker, Update Goal Tracker Data, Update Goal Tracker Local Data

## Building

1. Clone the repository:
   ```
   git clone https://github.com/your-repo/firebot-advanced-goal-tracker.git
   ```
2. Install dependencies:
   ```
   npm install
   ```
3. Build the script:
   ```
   npm run build:prod
   ```

## Troubleshooting

1. If the overlay isn't updating:
   - Check your internet connection
   - Verify API credentials
   - Ensure proper JSON formatting

2. If animations aren't working:
   - Check timing settings
   - Verify browser source is set up correctly
   - Refresh browser source

3. For API issues:
   - Double-check credentials
   - Verify API endpoints are accessible
   - Check firewall settings

## Support

For issues or feature requests, please check the following:
1. Verify your configuration
2. Check your browser source setup
3. Review your JSON formatting
4. Contact the developer with detailed information about your issue

## License

This script is provided as-is under the GPL-3.0 license. You are free to modify and distribute it according to your needs.