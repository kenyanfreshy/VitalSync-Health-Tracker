/**
 * Manual mock for expo-secure-store in the Vitest node test environment.
 */
const getItemAsync = async () => null;
const setItemAsync = async () => undefined;
const deleteItemAsync = async () => undefined;

module.exports = { getItemAsync, setItemAsync, deleteItemAsync };
