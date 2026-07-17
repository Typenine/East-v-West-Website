# Production deployment authorization

This repository is public, while the Vercel production project uses protected environment variables.

Production changes must be merged through an owner-authorized GitHub pull request. Direct commits created by external automation can be treated as unverified by Vercel, causing a deployment to build without protected database or service credentials.

For website updates:

1. Prepare and validate the complete change before pushing.
2. Push the change as one branch commit whenever practical.
3. Squash-merge the pull request as the sequential production update.
4. Verify the production API and any database-backed content after deployment.
