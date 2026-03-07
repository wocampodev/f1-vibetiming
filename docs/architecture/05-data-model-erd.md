# 05. Data Model ERD

This ERD captures the current Prisma schema used by ingestion and read APIs.

```mermaid
erDiagram
  TEAM ||--o{ DRIVER : has
  TEAM ||--o{ SESSION_RESULT : appears_in
  TEAM ||--o{ CONSTRUCTOR_STANDING : ranked_as

  DRIVER ||--o{ SESSION_RESULT : records
  DRIVER ||--o{ DRIVER_STANDING : ranked_as

  EVENT ||--o{ SESSION : contains
  SESSION ||--o{ SESSION_RESULT : has
  LIVE_CAPTURE_RUN ||--o{ LIVE_PROVIDER_EVENT : stores
  LIVE_CAPTURE_RUN ||--o{ LIVE_SESSION_SNAPSHOT : persists

  TEAM {
    string id PK
    string externalId UK
    string name
    string nationality
  }

  DRIVER {
    string id PK
    string externalId UK
    string givenName
    string familyName
    string code
    int number
    string teamId FK
  }

  EVENT {
    string id PK
    string externalId UK
    int season
    int round
    string name
    datetime raceStartTime
  }

  SESSION {
    string id PK
    string externalId UK
    string eventId FK
    string type
    datetime startsAt
    string status
  }

  SESSION_RESULT {
    string id PK
    string sessionId FK
    string driverId FK
    string teamId FK
    int position
    float points
    int laps
    string time
    string q1
    string q2
    string q3
  }

  DRIVER_STANDING {
    string id PK
    int season
    int round
    int position
    float points
    int wins
    string driverId FK
  }

  CONSTRUCTOR_STANDING {
    string id PK
    int season
    int round
    int position
    float points
    int wins
    string teamId FK
  }

  INGESTION_RUN {
    string id PK
    string kind
    string status
    datetime startedAt
    datetime finishedAt
    int recordsProcessed
    int season
    string errorMessage
  }

  LIVE_CAPTURE_RUN {
    string id PK
    string source
    string sessionKey
    string status
    datetime startedAt
    datetime lastEventAt
    datetime finishedAt
    int eventsCaptured
    int decodeErrors
  }

  LIVE_PROVIDER_EVENT {
    string id PK
    string captureRunId FK
    string source
    string sessionKey
    int runSequence
    string rawTopic
    string topic
    datetime emittedAt
    datetime receivedAt
    boolean decodeError
    string payloadHash
  }

  LIVE_SESSION_SNAPSHOT {
    string id PK
    string captureRunId FK
    string source
    string sessionKey
    datetime generatedAt
    datetime lastEventAt
    int version
  }

  LIVE_TOPIC_SCHEMA_CATALOG {
    string id PK
    string source
    string rawTopic
    string topic
    string shapeSignature
    datetime firstSeenAt
    datetime lastSeenAt
    int observations
    int decodeErrorCount
  }
```

Source of truth:

- `apps/api/prisma/schema.prisma`
