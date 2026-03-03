# Gameplay Guide - Updated Features

## Getting Started
1. Click "Start Game" or click in the canvas
2. Lock pointer with Esc to minimize distraction
3. WASD to move, mouse to look around, click to shoot

## New & Improved Features

### Jump Improvements
- **New Jump Height**: JUMP_SPEED increased from 12 → 20
- **Better Feel**: Jump now feels snappier with higher apex
- **Climbing**: Still auto-jumps onto nearby obstacles (platforms, cars)
- **Tips**: 
  - Use high arcs to evade zombies
  - Jump to reach platform safely
  - Can jump while firing for added mobility

### Player Speed
- **Base Speed**: Increased from 6 → 8 units/sec
- **Difficulty Scaling**: +6% per difficulty milestone
- **Zombie Comparison**: Player now significantly faster than regular zombies
- **Tips**:
  - Kite zombies around buildings
  - Sprint perpendicular to zombie groups
  - Use speed to reach platform when threatened

### Building Textures
- **Visual**: Buildings now have procedural window patterns
- **Details**: Includes brick texture, window reflections, grime
- **Immersion**: More realistic urban environment
- **Note**: Textures generated at runtime for performance

### Gun Physics
- **Recoil**: Backward force applied, but no wall penetration
- **Safety**: Can't accidentally push through buildings
- **Accuracy**: Center crosshair for best hit rate
- **Tips**:
  - Spray into groups at medium range
  - Hold click to activate hold-to-fire
  - Each shot staggers you slightly, plan positioning

## Disaster Events (Happen Every 3-4 Minutes)

### Event Warning System
- **5 Seconds Before**: Yellow warning appears
- **Text**: "Meteor shower incoming in 10s — find shelter!"
- **Action**: Head to your safe platform or find high ground
- **Tips**: Don't ignore warnings, events are deadly

### Event Types & Strategies

#### ☄️ Meteor Shower
- **Duration**: 10 seconds of meteors falling
- **Danger**: Each meteor kills zombies in area
- **Damage**: Direct hit = instant death (if not on platform)
- **Strategy**: 
  - Platform = completely safe
  - High buildings provide some protection
  - Keep moving to avoid meteor spawn zones

#### 🔥 Lava Eruption  
- **Duration**: 10 seconds of lava rising
- **Danger**: Lava level rises from -50 to +15 over 10 seconds
- **Damage**: Instant death in lava (if not on platform)
- **Strategy**:
  - Platform = highest safety (sits at y=1.5+)
  - Climb highest buildings and jump to platform
  - Lava destroys all zombies in path (free points)

#### 💧 Acid Rain (NEW)
- **Duration**: 10 seconds of acid drops falling
- **Danger**: 100 damage per 10s to exposed player
- **Mechanics**: 80 green spheres spawn from sky
- **Strategy**:
  - Platform is immune (standing on it = safe)
  - Indoor spaces provide partial protection
  - Each drop kills zombies on contact

#### ❄️ Hailstorm (NEW)
- **Duration**: 10 seconds of hail falling  
- **Danger**: 120 damage per 10s to exposed player (higher than acid)
- **Mechanics**: 60 ice blocks spawn from sky, larger projectiles
- **Strategy**:
  - Platform = complete immunity
  - More damage than acid rain, move faster to cover
  - Hail is slower falling, easier to dodge if moving

#### 🌍 Landslide (NEW)
- **Duration**: 10 seconds of ground rising
- **Danger**: Instant death if caught in landslide (unless on platform)
- **Mechanics**: Ground progressively crushes everything below, rising from -50 to +30 over 10s
- **Strategy**:
  - Platform = life-dependent safety
  - Must be on platform when landslide starts or you die
  - All zombies below are crushed
  - No safe buildings, only platform works

### Platform Strategy

#### When to Use Platform
- **During Events**: Always retreat to platform during disasters
- **Low Health**: Healing cooldown exists, use platform time to recover
- **Difficulty Spike**: When too many zombies spawn

#### Platform Benefits
- **Immunity**: Safe from all disaster events  
- **Elevation**: Good vantage point to clear zombies
- **Growth**: Platform size increases every 1000 points

#### Platform Costs
- **Score Penalty**: -20% score earned while standing on it
- **Limited Duration**: Only ~10s per event window
- **Zombie Reset**: 5s grace period when leaving (free time to escape)

#### Platform Mechanics
- **Grows Every 1000 Points**: Gets bigger at 1000, 2000, 3000, etc.
- **Height**: Sits above zombie reach, can't be climbed
- **Size**: Starts small, expands with score
- **Zombies Ignore It**: Won't walk on it

### 5-Second Grace Period (On Platform Exit)
- **Trigger**: When you leave the platform after an event
- **Duration**: 5 seconds of zombie "downtime"
- **Zombie Behavior**: Wander randomly, don't attack or chase
- **Advantage**: Use this time to reposition, reload, or create distance
- **Tips**:
  - Plan your exit - don't leave into a horde
  - Use grace period to reach better firing positions
  - After 5s, zombies resume normal aggressive behavior

## Difficulty Progression
- **Score Milestones**: Difficulty increases at 500, 1500, 2500, 3500+ points
- **Zombie Scaling**:
  - Speed increases 6% per milestone
  - HP increases per milestone
  - Mutant zombies spawn more frequently
  - Giant mutants appear at high difficulty
- **Player Compensation**: Player speed also scales +6% per milestone

## Scoring System
- **Zombie Kill**: +10 points (normal zombie)
- **Event Zombie**: +3-5 points (from disaster)
- **Platform Penalty**: -20% score while on platform
- **Passive Score**: +5 points/second just for staying alive
- **Survival**: Longer you last = higher score

## Tips for High Score
1. **Use Platform Wisely**: Only use for emergency survival, not camping
2. **Keep Moving**: Static targets attract zombies
3. **Manage Events**: Time your position before warning ends
4. **Utilize Speed**: Run circles around zombies
5. **High Ground**: Use buildings to get vista before events
6. **Grace Period**: Leave platform strategically, use 5s to gain advantage
7. **Difficulty Balance**: Don't let score climb too fast initially

## Troubleshooting

### "I can't reach the platform"
- Use auto-jump (hold spacebar while moving forward)
- Platform grows with score, gets progressively easier to reach
- Jump earlier when zombies threaten

### "Gun recoil pushes me into buildings"
- This is now FIXED - recoil has collision detection
- If you feel stuck, move away immediately

### "Zombies are moving too fast"
- This is intentional at high difficulty
- Use higher ground, buildings, and platform for safety
- Lower difficulty milestone by dying and respawning

### "Events happen too frequently"  
- Changed to 3-4 minute intervals (increased from 5)
- By design - pushes player to platform strategy
- Safe place is always available via platform

### "Platform doesn't give enough time"
- Platform is meant for emergency only, not safe camping
- 20% score penalty encourages leaving
- Use 5s grace period to escape smartly
- Win by skill, not camping

## Controls Reference
- **WASD**: Move forward/left/back/right
- **Mouse**: Look around (with pointer locked)
- **Left Click**: Shoot center (hold for spray)
- **Spacebar**: Jump
- **Esc**: Unlock pointer / Alt+Tab out
- **Start Button**: Begin game

## End Game Conditions
- **Death**: On screen health reaches 0
- **Causes**:  
  - Zombie attack (damage stacks if multiple hit)
  - Meteor/Lava/Acid/Hail/Landslide hit (instant kill if not on platform)
  - Not on platform during landslide
- **Reset**: Click Start button to restart fresh

Enjoy! 🎯
