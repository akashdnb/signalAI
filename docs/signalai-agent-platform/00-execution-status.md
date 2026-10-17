# 00 — Current Execution Status

## Decision: defer background worker

As of October 2026, the SignalAI implementation will **not deploy the Python background worker** because the current Render plan does not support the required background-worker deployment model.

This is an intentional sequencing decision, not an architecture rejection.

## Active implementation path

Build and validate these components now:

1. `signalai-server` capability layer
2. `signalai-connectors`
3. `signalai-mcp`
4. one real connector-backed capability
5. agent integration after the capability/MCP path is stable

Current execution model for bounded operations:

```text
UI / Agent / MCP
      |
      v
signalai-server
Capability Layer
      |
      v
signalai-connectors
      |
      v
External Provider
```

## Deferred path

The following is explicitly deferred:

```text
signalai-server
      |
 execution_jobs
      |
 Python background worker
      |
 connector / capability execution
```

The existing worker architecture and implementation may remain available for later adoption, but it must not become a deployment prerequisite for the current connector/MCP milestone.

## Instructions for implementation agents

Before starting work on SignalAI execution infrastructure, read this file.

**Do not:**

- deploy `signalai-python-worker`
- create a Render background worker as part of current connector/MCP work
- make connector or MCP delivery depend on the worker
- move synchronous capability logic into worker-only execution
- add worker deployment configuration merely to satisfy this milestone
- treat the worker as a current production dependency

**Do:**

- implement connectors behind the provider-neutral connector boundary
- expose connector functionality through `signalai-server` capabilities
- implement MCP as an adapter over the capability layer
- keep tenant authorization and business logic in the server
- preserve a future Job-based execution boundary for long-running work

## Future reactivation criteria

Revisit the worker when:

- the deployment platform/plan supports a suitable background-worker service, or
- an equivalent supported execution platform is selected, and
- a real workload requires asynchronous, long-running, retryable execution.

At that point, connect the existing capability/job contracts to the worker without redesigning MCP or UI contracts.

## Related plans

- `11-connectors-implementation-plan.md`
- `12-mcp-implementation-plan.md`
- `06-jobs-connectors-and-security.md`
