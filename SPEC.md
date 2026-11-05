# Summary

I want an app where I can easily enter the contents of my shelf by name and tag and understand how much space different types of things are taking up
 - I should be able to type or dictate individual items via my phone (use anthropic or local model for voice-to-text)
 - Tags should allow nesting.
 - I should be able to see a windirstat style visualisation

# Evaluation criteria

- The app should adhere to my skills and industry best practices.
- The UI should be mobile-first and evaluate well against the NN/g criteria.
- The basic flows should have unit and E2E playwright tests. Testing should be modest to prioritise moving fast.

# Tech choices
- react
- golang
- sqlite
- anthropic (or local)
- docker container

# Don't do
- anything related to hosting or ingress
