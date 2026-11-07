<script lang="ts">
    import ErrorBoundary from '../../components/ErrorBoundary.svelte';

    interface Props {
        shouldThrow?: boolean;
    }
    let { shouldThrow = true }: Props = $props();

    function explode(): never {
        throw new Error('boom');
    }
</script>

<ErrorBoundary>
    {#if shouldThrow}
        {explode()}
    {:else}
        <p>safe content</p>
    {/if}
</ErrorBoundary>
