#!/bin/bash

VERSION="0.0.4"
TAG="v$VERSION"
RELEASE_TITLE="Release $VERSION"
RELEASE_BODY="Add dynamic audio to a process_videos.sh for version $VERSION."

# Optional: confirm current branch is main or tag source
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Tag it locally (if not already)
git tag -a "$TAG" -m "$RELEASE_TITLE"
git push origin "$TAG"

# Create GitHub release (requires GitHub CLI to be installed and authenticated)
gh release create "$TAG" \
  --title "$RELEASE_TITLE" \
  --notes "$RELEASE_BODY" \
  --target "$BRANCH"
