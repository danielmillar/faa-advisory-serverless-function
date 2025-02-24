# FAA Advisory Serverless Functions

A serverless API that fetches and processes FAA (Federal Aviation Administration) advisories related to SpaceX operations, including Starship and Starlink.

## Features

- Automatically fetches new advisories every 5 minutes from CADENA OIS
- Filters for SpaceX-related advisories (Starship, Starlink)
- Parses complex date/time formats from advisory details
- Stores processed advisories in MongoDB
- Provides REST API endpoints for retrieving advisories

## API Endpoints

### GET /spacex/advisories
Retrieves all stored SpaceX-related advisories from the database.

### POST /spacex/fetch-new-advisories
Manually triggers a fetch of new advisories from CADENA OIS. This endpoint is also called automatically every 5 minutes via Vercel Cron Jobs.

## Technical Details

- Built with TypeScript and Vercel Serverless Functions
- Uses MongoDB for data storage
- Implements CORS for cross-origin requests
- Includes sophisticated parsing for various date/time formats in advisory details