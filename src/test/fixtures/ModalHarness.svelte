<script lang="ts">
    import Modal from '../../components/Modal.svelte';

    interface Props {
        isOpen?: boolean;
        onClose: () => void;
    }
    let { isOpen = true, onClose }: Props = $props();
</script>

<Modal {isOpen} {onClose} label="Test dialog">
    <button>Inside</button>
    <button>Second</button>
</Modal>
