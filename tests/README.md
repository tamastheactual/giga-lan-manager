# Tests Folder Overview

Contains test files for validating tournament logic.

## Files
- `brackets.test.ts`: Tests bracket structure for various player counts

## Key Functions
- `createTournamentWithGroupResults(numPlayers)`: Simulates tournament with group stage completed
- `analyzePlayoffStructure(tournament, numPlayers)`: Counts bracket types and playoff players
- `validateBracketStructure(numPlayers, expectedStructure)`: Runs tests against predefined cases for 4-13 players
- Test suite with console logging for validation results